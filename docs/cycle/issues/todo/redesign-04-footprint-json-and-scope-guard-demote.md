---
id: redesign-04-footprint-json-and-scope-guard-demote
title: Engine-owned touched.json footprint and demote scope guard to non-blocking warning
workflow: feature
depends_on: []
triaged_at: "2026-05-21T03:12:41.567Z"
source: triage
---
## Context

The scope guard in `src/engine/commit-cycle.ts` (`scopeGuard`, ~line 35) blocks the commit when a `src/`/`scripts/` file modified by the agent is absent from BUILD.md's `## Touched Files` list. Two consecutive violations trip `engine.paused {reason: "commit-scope-guard-loop"}` — this halted cycles 0200–0201. The footprint lives in agent-authored markdown prose that can drift or be misreported. Blocking is wrong: a fix may depend on a file outside the declared footprint; a footprint-only commit could ship a broken tree.

See [RFC-003](../../../RFC-003-in-cycle-remediation-and-priority-routing.md) §3. Foundational for redesign-06 (`final_fix` will append to the same footprint).

## Implementation Plan

### Step 1: Audit current scope guard
- `src/engine/commit-cycle.ts`: locate `scopeGuard`, `scopeGuardViolations`, and the `commit-scope-guard-loop` halt emission
- `src/cli.ts`: locate `scopeGuardViolations` counter, increment, and associated halt trigger
- `src/engine/run-cycle.ts`: line ~287, find the pre/post git snapshot machinery used by the documentation step — this is the exact pattern to reuse

### Step 2: Implement `touched.json` footprint accumulation
- In `src/engine/run-cycle.ts`, before each mutating step (`build`, `fix`), capture `git status --porcelain` as a "before" snapshot
- After the step completes, capture a second snapshot; diff the two to extract newly-dirtied files
- Accumulate the union into `touched.json` in the cycle artifact dir (`.cycle/artifacts/<cycle-id>/touched.json`)
- Schema: `{ "files": string[] }` — sorted, deduplicated, repo-root-relative paths
- Reuse the helper already present for the documentation step snapshot; do not duplicate the logic

### Step 3: Demote scope guard to non-blocking warning
- In `src/engine/commit-cycle.ts`, replace the blocking guard:
  1. Load `touched.json` from cycle artifact dir (fallback: treat footprint as empty set)
  2. Identify `src/`/`scripts/` files in the staging area absent from `touched.json`
  3. If any exist: emit `commit.scope_warning` event with `{ files: string[] }` payload — do **not** block
  4. Continue with `stageFiles` (stage everything dirty) unchanged
- Remove the blocking `throw`/early-return on scope violation entirely

### Step 4: Remove halt counter
- `src/cli.ts`: remove `scopeGuardViolations` counter, its increment, and the `engine.paused {reason: "commit-scope-guard-loop"}` emission site
- Sweep `src/engine/run-cycle.ts` and any other callers for `commit-scope-guard-loop` / `scopeGuardViolations` references and delete

### Step 5: Persist scope warning for reflection
- The `commit.scope_warning` event must land in `.cycle/log.jsonl` via the existing `appendLog` path so the reflection step (redesign-07) can read it
- Alternatively write `scope-warning.json` to the cycle artifact dir — whichever matches how reflection reads per-cycle data; choose one and document it in `docs/ENGINE.md`

### Step 6: Tests
- **Footprint accumulation**: two mutating steps each dirty different files → `touched.json` contains the union of both
- **In-footprint commit**: all dirty `src/` files present in `touched.json` → no `commit.scope_warning` emitted
- **Out-of-footprint commit**: a `src/` file dirty but absent from `touched.json` → `commit.scope_warning` emitted with that file listed; commit still succeeds and stages the file
- **Halt path removed**: confirm no test or code path references `commit-scope-guard-loop` as reachable

### Step 7: Coverage and typecheck
- `npm run test:coverage && npm run check:coverage`: maintain per-file floors for `src/engine/commit-cycle.ts` and `src/engine/run-cycle.ts`; aggregate Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%
- `npm run typecheck`: zero warnings
- Report numbers in `BUILD.md`

## Key Files

| File | Change |
|---|---|
| `src/engine/run-cycle.ts` | Add pre/post git snapshot around `build` and `fix` steps; write/accumulate `touched.json` |
| `src/engine/commit-cycle.ts` | Replace blocking guard with `commit.scope_warning` emission |
| `src/cli.ts` | Remove `scopeGuardViolations` counter and `commit-scope-guard-loop` halt trigger |
| `tests/commit-cycle.test.ts` | Update/add tests for non-blocking warning behavior |
| `tests/run-cycle.test.ts` | Add footprint accumulation tests |
| `docs/ENGINE.md` | Document `touched.json` schema, location, and `commit.scope_warning` event |

## Acceptance Criteria

- [ ] `touched.json` written by engine from git deltas across mutating steps; not authored by agent
- [ ] Out-of-footprint `src/` file commit **succeeds** and emits `commit.scope_warning` with that file listed
- [ ] `commit-scope-guard-loop` halt path and `scopeGuardViolations` counter fully removed; no commit ever blocked by scope
- [ ] Scope-warning file list persisted (log or artifact dir) where reflection can read it
- [ ] Tests cover: footprint union across build+fix, in-footprint (no warning), out-of-footprint (warning emitted + commit succeeds)
- [ ] Coverage floors maintained; `npm run typecheck` clean

## Coordination Notes

- redesign-06 (`final_fix`) will append to the same `touched.json` footprint — design the accumulation write so `final_fix` can extend it without rewriting
- No hard prerequisite on redesign-01/02/03, but landing after them reduces rebase surface
