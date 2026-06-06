---
id: cycle-ops-workflow-for-operational-tasks
title: "New `ops` workflow for operational / deploy / one-off-command tasks (triage currently routes them to `feature`)"
source: observation
---
## Problem

cycle ships four workflows — `feature` (full SDLC), `document` (docs-only), `quickfix`
(surgical code fix), `e2e-tests` — and **none fit an operational / deployment / one-off
task**: "run `npx instant-cli push schema` against the live app", "rotate a key", "run a
data migration", "deploy", "apply a config change to live infra". These are not feature
work (no spec/research/PR-review of a code diff), not docs, not a code bugfix, and not
e2e tests. With no fitting workflow, **triage defaults them to `feature`**, which forces a
heavyweight spec→research→build→review→verify pass onto what is really "run this command,
confirm it took, record what you did."

Observed live while draining the **blended** queue (see *Instances observed* — collecting
evidence before committing to a design).

## Recommended `ops` workflow (draft)

A lightweight workflow: figure out the exact operation, do it, confirm it, record it. No
feature spec/research; tolerant of "no code diff" (the deliverable is the operation +
a runbook/log entry, not a source change). Following cycle's `workflows.yml` schema:

```yaml
  - name: ops
    description: One-off operational / deployment / maintenance task — run a command,
      migration, deploy, or live-infra change. No feature spec/research; identify → execute
      → verify → record. Tolerates an empty code diff.
    max_cycle_attempts: 2
    steps:
      - { name: plan_ops,      prompt: prompts/plan_ops.md }       # exact command(s), preconditions, blast radius, rollback, what "done" looks like
      - { name: execute_ops,   prompt: prompts/execute_ops.md }    # perform the operation (agent may invoke bash); capture stdout/exit
      - { name: verify,        agent: bash, command: scripts/verify.sh }  # confirm effect / no regression
      - { name: documentation, prompt: prompts/documentation.md }  # record what was run + result in a runbook/changelog
```

## Open design questions (refine as evidence accrues)

1. **Empty-diff tolerance.** An ops task often produces **no source change** (it acts on
   live infra). cycle's anti-slop empty-diff guard + `worktree-pr` commit assume a code
   diff. The `ops` workflow must either commit only a runbook/log entry, or mark the op
   complete with no commit — without tripping the empty-diff halt.
2. **Confirmation / safety gate for live/destructive ops.** Pushing schema to a live app,
   migrating, deploying — these are irreversible-ish. Consider a dry-run/confirm step or a
   `--yes`-style gate, and whether ops should run on the base branch directly (like
   `e2e-tests`) vs a worktree.
3. **Triage routing signal (the actual fix).** Give triage an `ops` option and the cues to
   pick it — verbs like *push / deploy / migrate / rotate / run <cli> against live / apply
   / publish*, and "operates on running/live infra, not the codebase." Without this, ops
   tasks keep defaulting to `feature`.
4. **Verify semantics.** `scripts/verify.sh` is a code-test gate; an ops task may need a
   different "did it take?" check (query the live resource) — or just skip/soften verify.

## Promotion criteria

Keep this in `ideas/` and **append each new instance** below as blended (and other repos)
progress through 12+ issues. Once **4–6 clear instances** confirm the pattern (ops tasks
mis-routed to `feature`, or a real need for a distinct flow), refine the design from the
collected evidence, move this to `inbox/`, and run cycle on the cycle repo to build it.

## Instances observed

1. **2026-06-06 — blended `refl-0001-push-blended-schema-to-live-instant-app`.** Reflection
   follow-up from blended cycle 0001 (InstantDB schema foundation). The task: run
   `npx instant-cli push schema` against the **live** Instant app — a pure deploy/ops step.
   Triage assigned **`workflow: feature`**. Clear ops task; wrong-fit workflow. (priority: medium)

<!-- Append further instances here as they appear (blended + other managed repos). -->
