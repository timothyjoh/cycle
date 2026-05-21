---
id: redesign-04-footprint-json-and-scope-guard-demote
source: text
title: Engine-owned touched.json footprint and demote scope guard to non-blocking warning
added_at: "2026-05-21T02:42:44Z"
triage_attempts: 0
priority: high
---

See [RFC-003](../../../RFC-003-in-cycle-remediation-and-priority-routing.md) §3. Foundational for redesign-06.

## Problem

The commit scope guard (`src/engine/commit-cycle.ts:35 scopeGuard`) blocks the commit if any dirty `src/`/`scripts/` file is absent from BUILD.md's agent-authored `## Touched Files` list; two violations trip `engine.paused {reason: "commit-scope-guard-loop"}` (cycles 0200–0201). The footprint lives in brittle markdown prose that can drift or be misreported. And blocking is wrong under the new model: the commit must stage everything (a fix may depend on a file outside the declared footprint; a footprint-only commit could ship a red tree).

## Approach

1. **`touched.json` — engine-owned, git-derived.** The engine snapshots `git status --porcelain` before each mutating step (`build`, `fix`, and later `final_fix`) and records the delta after; `touched.json` (in the cycle artifact dir) is the union. This replaces parsing BUILD.md's `## Touched Files`. Reuse the pre/post snapshot machinery already added for the documentation step (`src/engine/run-cycle.ts:287`).
2. **Demote the scope guard.** It no longer blocks. The commit continues to stage everything dirty (current `stageFiles` behavior). Any `src/`/`scripts/` file dirty but outside the footprint is emitted as a **non-blocking `commit.scope_warning`** event carrying the file list. Remove the scope-violation halt path (`commit-scope-guard-loop`) and the associated `scopeGuardViolations` counter in `src/cli.ts`.
3. The `commit.scope_warning` file list must be retrievable by the reflection step (redesign-07) — persist it where reflection can read it (e.g. the cycle artifact dir or the log).

## Acceptance Criteria

- [ ] `touched.json` is written by the engine from git deltas across mutating steps; not authored by the agent.
- [ ] A commit with an out-of-footprint `src/` file **succeeds** and emits `commit.scope_warning` with that file listed.
- [ ] The `commit-scope-guard-loop` halt path and its counter are removed; no commit is ever blocked by scope.
- [ ] The scope-warning file list is persisted for reflection to consume.
- [ ] Tests cover: footprint accumulation across build+fix, in-footprint commit (no warning), out-of-footprint commit (warning emitted, commit still succeeds).
- [ ] Prerequisite: none hard, but coordinate with redesign-06 (final_fix appends to the same footprint).
- [ ] Recommended workflow: `feature`.
