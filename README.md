<p align="center">
  <img src="./cycle-0.0.1.png" alt="cycle slop logo (better hand-drawn version to come)" width="400" />
</p>

# cycle

**cycle is a dark factory for AFK software development.** Drop in work, walk away, and let an agent-operated assembly line triage the repo, break the work into buildable slices, run the right workflow, verify the result, and land reviewable PRs.

It is built for the two places autonomous development usually gets hard:

- **Greenfield repos**, where a rough brief needs to become a sequence of scoped implementation cycles.
- **Brownfield repos**, where every ticket hides conventions, coupling, stale tests, and merge policy that a naive agent will miss.

cycle turns those inputs into an ordered queue of durable, auditable code-production cycles.

## What cycle is

cycle is an issue-driven workflow engine for autonomous code changes. It is installed into a repository, invoked by a parent agent or CI job, and then runs until its queue is empty or a safety gate tells it to stop.

An **issue** can be almost anything:

- a one-line freeform task
- a GitHub / Jira / Linear ticket copied into the repo
- a bug report
- a PRD
- a BRIEF-sized greenfield ask
- a reflection surfaced by a previous cycle

cycle's job is to make that work machine-operable: triage it, enrich it with codebase context, decompose large asks into vertical slices, run the configured workflow for each slice, and emit branches, commits, PRs, logs, and artifacts as it goes.

## Why it exists

Most agentic coding tools are great at a single interactive turn. They are weaker at the factory problem: taking a backlog, repeatedly doing the boring SDLC loop, respecting repo-specific constraints, recovering from failure, and leaving enough paper trail for a human to trust what happened.

cycle is that factory layer.

It gives a parent agent a single subprocess to hand work to, while cycle handles the repeatable mechanics:

- **Intake:** normalize freeform tasks, tracker issues, and raw markdown drops into one inbox.
- **Triage:** inspect the repo, select a workflow, and split oversized asks into smaller cycles.
- **Execution:** run `spec → research → plan → build → review → fix → verify → commit → pr` style workflows.
- **Quality gates:** run verification before commit / PR, lean on branch protection, and retry failed cycles from a clean slate.
- **State:** keep a live drain queue plus an append-only JSONL audit log.
- **Recovery:** resume in-flight work after a crash, pause safely when triage fails, and block only dependent work after terminal failures.

## The dark factory model

In default "dark factory" mode, every cycle is an isolated production run:

1. Start from the current base branch.
2. Create `cycle/<workflow>/<slug>`.
3. Run the workflow steps with repo-aware prompts and scripts.
4. Verify the change.
5. Commit only the intended change surface.
6. Open a PR.
7. Auto-merge when branch protection allows it, or fall back to the repo's configured merge path.
8. Move to the next queued cycle from the freshly updated base branch.

If a run gets into a bad state, cycle is designed to abandon that attempt and restart from a clean branch rather than nurse a compromised working tree. The goal is not to make agents look busy; it is to keep the assembly line safe enough to leave AFK.

## Why it works for brownfield

Brownfield work is where autonomous coding usually falls apart. cycle assumes the repo is messy until proven otherwise:

- issue descriptions may be stale or incomplete
- tests may already be failing
- conventions may differ across subtrees
- changes may have hidden blast radius
- merge policy may vary by repo
- failures should not poison unrelated queued work

So cycle makes repo context and artifacts first-class. Each cycle writes durable outputs under `docs/cycle/<cycle-id>-<workflow>-<slug>/`, keeps issue state under `docs/cycle/issues/`, and mirrors progress to `.cycle/log.jsonl`. A human can inspect the factory floor after the fact instead of reverse-engineering what the agent did from a chat transcript.

## What ships into a repo

`npx @cycleai/cli init` installs a small, repo-local factory kit:

- `.cycle/bin/cycle.js` — the bundled engine
- `.cycle/workflows.yml` — engine, triage, and workflow configuration
- `.cycle/prompts/` — prompts for spec, research, plan, build, review, fix, verify, reflection, and triage
- `.cycle/scripts/` — git / GitHub helpers such as `commit.sh` and `pr.sh`
- `docs/cycle/issues/` — raw / todo / done / failed / blocked issue folders
- optional `.claude/skills/cycle.md` — a Claude Code skill that teaches a parent agent how to invoke cycle

The consuming repo does not need to become a Node project. After init, the committed `.cycle/bin/cycle.js` bundle is the engine.

## Quick start

Initialize cycle in a repo:

```sh
npx @cycleai/cli init
```

Run a single freeform task:

```sh
./.cycle/bin/cycle.js run "fix the flaky login test"
```

Drop work into the inbox without starting the engine:

```sh
./.cycle/bin/cycle.js drop "investigate why checkout retries twice"
./.cycle/bin/cycle.js drop "investigate why checkout retries twice" --priority 7
```

`--priority N` accepts an integer in `1..10` and defaults to `3`.

Inspect the queue and latest log-derived status:

```sh
./.cycle/bin/cycle.js status
```

Re-run triage diagnostics without mutating engine state:

```sh
./.cycle/bin/cycle.js triage --dry-run
```

## Current behavior

- `commit.sh` selectively stages the cycle's intended change surface and honors a hard denylist for `.claude`, `dist`, `node_modules`, `*.lock`, and submodule gitlinks.
- `pr.sh` opens the PR with `--squash --auto` and falls back to a synchronous squash merge when the repo has auto-merge disabled, deleting the orphaned remote branch afterward.
- `commit.sh` and `pr.sh` append `Closes #N` lines for any `https://github.com/<owner>/<repo>/issues/<N>` URL found in the cycle's issue body, scoped to the current repo, so merged PRs auto-close the referenced issues.
- The feature workflow is the main dogfooded path today; the docs describe the broader workflow library and factory model the engine is growing toward.

## Design docs

- [`BRIEF.md`](BRIEF.md) — product brief and resolved design decisions.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture, state model, and integration surfaces.
- [`docs/RFC-001-issue-lifecycle.md`](docs/RFC-001-issue-lifecycle.md) — accepted issue lifecycle, triage, queue, and blocked-work semantics.
- [`docs/WORKFLOW-SPEC.md`](docs/WORKFLOW-SPEC.md) — workflow philosophy and future repo-intelligence hooks.
- [`docs/DOGFOOD.md`](docs/DOGFOOD.md) — first cycle dogfood notes and lessons.

## Recovering from engine.paused

When every raw issue fails triage in a single pass, the engine emits `engine.paused {reason: "all_triage_failed", raw_ids, last_errors}`, moves each failed raw to `docs/cycle/issues/failed/<id>.md` with `failed_step: "triage"` stamped into its frontmatter, and exits non-zero. `tbd.jsonl` is untouched and no cycle was started, so the work queue is intact and the engine is safe to re-fire once the underlying problem is fixed.

### Payload

```jsonc
{
  "reason": "all_triage_failed",
  "raw_ids": ["<id>", "..."],
  "last_errors": [{ "raw_id": "<id>", "error": "<≤2000 chars, head-kept>" }],
}
```

Each `error` is capped at 2000 chars (head-kept; trailing `…` on overflow), so a runaway agent stdout still produces a bounded payload.

### 1. Inspect the pause event and the failed raws

Tail the audit log to read the structured failure:

```sh
tail -n1 .cycle/log.jsonl | jq 'select(.event == "engine.paused")'
```

The `raw_ids` array lists every raw that was attempted; `last_errors` carries the validator (or agent) error from each raw's final retry. The corresponding files are now under `failed/`:

```sh
ls docs/cycle/issues/failed/
```

Raws stamped with `failed_step: triage` in their frontmatter are the ones the paused pass moved (alongside `failed_at` and `triage_attempts: 3`). Note: the audit log also contains one `triage.raw.failed` event per attempt per raw preceding the final `engine.paused`.

Most pauses point at one of:

- A broken triage prompt (validator rejects every output → fix `src/defaults/prompts/triage.md` or the configured triage prompt).
- An upstream API outage (every call failed identically → wait and re-fire).
- A batch of malformed raw issues (each raw has a distinct error → edit or delete them).

### 2. Iterate with `cycle triage --dry-run`

`cycle triage --dry-run` only scans `docs/cycle/issues/raw/`. To re-test a failed raw, move it back into `raw/` first:

```sh
mv docs/cycle/issues/failed/<id>.md docs/cycle/issues/raw/<id>.md
# ...edit the file or the prompt...
cycle triage --dry-run
```

Output is `Array<{raw_id, status, attempts, last_error?, children?}>` printed as JSON to stdout. Exit code is `0` if every raw passes validation, `1` if any raw still fails. The agent binary still runs (so its own side effects are out of scope), but the engine performs no filesystem mutations under `docs/cycle/issues/*` and no append/rewrite of `.cycle/tbd.jsonl` or `.cycle/log.jsonl`.

An empty `raw/` also exits `0`, so the exit code is meaningful only when at least one raw has been restored. Run the loop after each fix until the command exits `0` with the restored raws reported as passing.

### 3. Fix the failing raws

For each entry in `last_errors`, choose one path:

- **Edit `docs/cycle/issues/failed/<id>.md`** if the issue is real but its content tripped the prompt (typo, missing context, ambiguous title, malformed frontmatter). Move it back to `raw/` (`mv docs/cycle/issues/failed/<id>.md docs/cycle/issues/raw/<id>.md`) and re-run `cycle triage --dry-run` until it passes.
- **Delete the file** (`rm docs/cycle/issues/failed/<id>.md`) if the issue should not have been queued at all — a duplicate, an obsolete reflection finding, or anything the human queue manager would have rejected in review.

If the failure mode is a broken prompt rather than bad raws, edit the configured triage prompt instead (and `npm run sync-defaults` if you changed `src/defaults/`), then move the affected raws back to `raw/` and re-run `cycle triage --dry-run`.

### 4. Re-fire the engine

Once `cycle triage --dry-run` exits `0` with the restored raws reported as passing, restart the engine using the same invocation that originally hit the pause (e.g., `cycle` or `./.cycle/bin/cycle.js`, depending on how it was launched). No rollback or cleanup step is required.

### Safety guarantee

The paused pass started no cycle, pushed no branch, opened no PR, and made no change to `tbd.jsonl` or `done/`. The only on-disk side effects are the raw files moved from `raw/` to `failed/` (with `failed_step: "triage"` frontmatter stamped) and the `engine.paused` line plus preceding `triage.raw.failed` events in `.cycle/log.jsonl`. Re-firing therefore picks up cleanly: triage runs again from scratch on whatever raws now sit in `raw/`, and the queue resumes as if the failed pass had never started.
