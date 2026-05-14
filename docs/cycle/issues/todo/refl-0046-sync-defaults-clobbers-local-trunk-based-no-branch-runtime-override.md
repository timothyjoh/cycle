---
id: refl-0046-sync-defaults-clobbers-local-trunk-based-no-branch-runtime-override
title: Make `no_branch` operator-overridable at runtime to eliminate `.cycle/workflows.yml` divergence
workflow: feature
depends_on: []
triaged_at: "2026-05-14T17:00:46.864Z"
source: triage
parent: refl-0046-sync-defaults-clobbers-local-trunk-based
---
## Problem

The root cause of the cycle 0046 sync-defaults incident is that this repo carries a permanent local divergence between `src/defaults/workflows.yml` (branch-based shape, what consumer repos receive on `cycle init`) and `.cycle/workflows.yml` (trunk-based shape, what this single-developer repo actually uses: `no_branch: true`, `commit-trunk.sh`, no `pr` step). The divergence exists because dogfooding requires this repo to behave differently from a generic consumer repo, but the same `sync-defaults` plumbing that ships defaults to consumers also runs locally — and any local sync clobbers the divergence.

The sibling `guard-sync-defaults-against-divergent-files` child treats the symptom (don't let sync clobber). This child treats the cause: eliminate the need for divergence so `.cycle/workflows.yml` can be a faithful copy of `src/defaults/workflows.yml` and `sync-defaults` can run safely at any time.

## Approach

Make `no_branch` (and the associated branch-vs-trunk commit-script + presence-of-`pr`-step choices) operator-overridable at runtime, without editing `workflows.yml`. Reasonable mechanisms (pick in spec):

- **Env var:** e.g., `CYCLE_TRUNK_BASED=1` flips `no_branch` on for every workflow that supports it, and substitutes `commit-trunk.sh` for `commit.sh`, and skips the `pr` step. Persistable in `.cycle/.env` or shell profile.
- **CLI flag on `cycle run` / engine start:** e.g., `--trunk` (and its negation `--no-trunk` for explicit override of an env default).
- **Per-repo override file:** e.g., `.cycle/overrides.yml` carrying just the deltas, layered on top of `workflows.yml` at load time.

Favor whichever is least disruptive to existing `runCycle` / workflow-loading code and easiest to express in the engine. Env var + CLI flag layered (CLI wins, env is default) is a common low-friction shape.

## Acceptance criteria

1. With the override active (env var or CLI flag), the engine treats the `feature` workflow as if it had `no_branch: true` even when `workflows.yml` says otherwise: no `createCycleBranch`, no `pr` step, commit step uses the trunk-based commit script.
2. With the override inactive (default for consumer repos), behavior is unchanged from today's branch-based default.
3. `src/defaults/workflows.yml` and `.cycle/workflows.yml` become byte-identical (and stay that way through `sync-defaults`). The hotfix-installed divergence comment block in `.cycle/workflows.yml` is removed; instead, a top-level comment in `src/defaults/workflows.yml` documents the override mechanism and points trunk-based repos at it.
4. A bootstrap mechanism (e.g., `.cycle/.env` containing `CYCLE_TRUNK_BASED=1`, or a documented `cycle init --trunk` flag, or an explicit note in CLAUDE.md) ensures this repo continues to run trunk-based after upgrade. Document the chosen mechanism in CLAUDE.md's "Workflow style" section.
5. Resume + restart-policy paths (build/fix `head_sha` capture/reset) behave correctly under the override. In particular: when override is active, `no_branch: true` is in effect, so the resume code's "skip capture+reset for `no_branch: true` workflows" rule applies. Add or update a test to cover this.
6. Existing tests for branch-based feature workflow (commit.sh, pr.sh, createCycleBranch) continue to pass when override is inactive. New tests cover the override path end-to-end against the `feature` workflow.
7. Coverage thresholds held; CLAUDE.md updated.

## Out of scope

- Migrating other potential divergences (prompts, scripts) — they should already be byte-identical via `sync-defaults`. If any aren't, file separately.
- Changing the consumer-repo default away from branch-based.

## Notes

- Once this child lands, the sibling `guard-sync-defaults-against-divergent-files` is no longer load-bearing for the `.cycle/workflows.yml` case specifically — but it remains valuable as defense in depth and for other potential divergences, so do not delete it on this cycle.
- Be careful with `cli.ts:terminalDrain` and queue/branch code that branches on `no_branch`. Centralize the resolved value (post-override) at engine start and pass it through, rather than re-reading the workflow object in each call site.
- If env var is chosen, prefer reading it once at engine bootstrap and stamping the resolved workflow object, so downstream code stays unaware of the env var.
