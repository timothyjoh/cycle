---
id: refl-0042-engine-base-pull-fetches-main-but-repo-i
title: "Skip `cycle.base_pull` when workflow declares `no_branch: true`"
workflow: feature
depends_on: []
triaged_at: "2026-05-14T15:44:04.888Z"
source: triage
superseded_by: refl-0040-engine-base-branch-resolution-hardcodes
superseded_at: "2026-05-15T21:39:52.993Z"
---
## Problem

Every cycle on the `feature` workflow currently emits a `cycle.base_pull {status: "failed", base: "main", reason: "git fetch origin main failed: fatal: couldn't find remote ref main"}` event in `.cycle/log.jsonl`. The repo's default branch is `master` and the `feature` workflow already moved to `no_branch: true` (commit `ddf3752`, see `.cycle/workflows.yml`), so cycles complete fine — but `base_pull` still runs unconditionally, resolves the base as `main` (from a stale `CYCLE_BASE=main` env default upstream of the CLI), and fires a failed event on every single cycle.

This pollutes the audit log and obscures real failure signal during triage of `engine.paused`, resume entry, and `cycle.end status:failed` events.

## Root cause

`cycle.checkout` is correctly gated on `no_branch: true` (skipped when the workflow opts out of branching). `cycle.base_pull` is not — it runs regardless of `no_branch`, which is the wrong contract: if a workflow is trunk-based and never creates a `cycle/<slug>` branch, there's nothing to fast-forward-merge a base into.

## Scope

Narrow fix: honor `no_branch: true` by skipping `base_pull` entirely for any workflow that sets it. Mirror the existing `cycle.checkout` skip path so behavior is symmetric.

The broader fix — sourcing the base from the workflow's `base:` field instead of `CYCLE_BASE` env default, so branch-based workflows on `master`-default repos also stop hardcoding `main` — is already tracked by `refl-0040-engine-base-branch-resolution-hardcodes` and is out of scope here.

## Acceptance

- On a workflow with `no_branch: true`, `cycle.base_pull` is NOT emitted (preferred) OR is emitted as `cycle.base_pull {status: "skipped", reason: "no_branch"}`. Pick whichever is consistent with how `cycle.checkout` handles the same skip — do not invent a new event shape.
- On a workflow without `no_branch` (or `no_branch: false`), behavior is unchanged: `base_pull` still runs and emits `status: "ok"` or `status: "failed"` as before.
- New regression test in the engine test suite exercises both paths: (a) `no_branch: true` workflow does not emit a failed `base_pull` event, (b) branch-based workflow still emits the event.
- `.cycle/log.jsonl` on a fresh run of the dogfood repo (on `master`, `feature` workflow) contains zero `cycle.base_pull` failed entries for the new cycle.
- Coverage policy holds: line ≥ 95%, branch ≥ 75%, func ≥ 90%; no per-file regression in the engine module touched.

## Out of scope

- Centralizing base-branch resolution on workflow `base_branch` (covered by `refl-0040-engine-base-branch-resolution-hardcodes`).
- Removing the stale `CYCLE_BASE=main` env default upstream of the CLI — note where it's set and whether the `refl-0040` fix obviates it, but do not chase the cleanup in this cycle.
