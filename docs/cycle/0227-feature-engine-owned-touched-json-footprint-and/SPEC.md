# SPEC — Cycle 0227: Engine-Owned touched.json Footprint and Non-Blocking Scope Guard

## Objective

This cycle replaces the blocking `scopeGuard` in `commit-cycle.ts` — which has halted production cycles by rejecting commits whose agent-authored footprint drifts from actual file changes — with two cooperating mechanisms: an engine-computed `touched.json` built from real git deltas across mutating steps, and a demoted, non-blocking `commit.scope_warning` event that logs discrepancies for reflection without ever stopping a commit. The result is a commit path that never blocks on footprint mismatch and a machine-authored record of which files each cycle actually touched.

## Source Issue

`redesign-04-footprint-json-and-scope-guard-demote` — "Engine-owned touched.json footprint and demote scope guard to non-blocking warning"

## Scope

### In Scope
- Pre/post `git status --porcelain` snapshots around `build` and `fix` steps in `run-cycle.ts`, accumulated into `.cycle/artifacts/<cycle-id>/touched.json`
- Replacement of the blocking scope guard in `commit-cycle.ts` with a non-blocking `commit.scope_warning` event emission
- Removal of the `scopeGuardViolations` counter and `commit-scope-guard-loop` halt path from `cli.ts`

### Out of Scope
- `final_fix` step reading or appending to `touched.json` (redesign-06)
- Reflection step consuming `commit.scope_warning` (redesign-07)
- Any changes to existing stale-dist or branch naming logic

## Requirements

- Engine captures `git status --porcelain` before and after each mutating step (`build`, `fix`) and writes the union of newly-dirtied files to `touched.json` in the cycle artifact dir
- `touched.json` schema: `{ "files": string[] }` — sorted, deduplicated, repo-root-relative paths; each run accumulates (appends, does not overwrite previous steps' files)
- `commit-cycle.ts` loads `touched.json` (fallback: empty set if absent); if any staged `src/` or `scripts/` file is absent from `touched.json`, emits `commit.scope_warning` with `{ files: string[] }` payload via `appendLog`, then continues staging and committing unchanged
- The blocking `throw`/early-return on scope violation is removed entirely
- `scopeGuardViolations` counter and the `engine.paused { reason: "commit-scope-guard-loop" }` emission are deleted from `cli.ts`
- Snapshot logic reuses the helper already present for the documentation step rather than duplicating it
- `commit.scope_warning` lands in `.cycle/log.jsonl` via `appendLog`

## Acceptance Criteria

- [ ] `touched.json` exists in `.cycle/artifacts/<cycle-id>/` after a cycle run with at least one mutating step, containing only files dirtied by engine-observed git deltas — not agent-authored prose
- [ ] A commit where a `src/` file is absent from `touched.json` **succeeds** and emits exactly one `commit.scope_warning` event with that file in the `files` array
- [ ] A commit where all staged `src/` files are present in `touched.json` emits no `commit.scope_warning`
- [ ] No code path in `cli.ts`, `run-cycle.ts`, or `commit-cycle.ts` references `commit-scope-guard-loop` or `scopeGuardViolations` after this cycle
- [ ] Two sequential mutating steps dirtying disjoint file sets produce a `touched.json` whose `files` is the union of both sets
- [ ] `npm run test:coverage && npm run check:coverage` passes with per-file floors for `commit-cycle.ts` and `run-cycle.ts` maintained
- [ ] `npm run typecheck` exits clean with zero warnings
- [ ] All existing tests still pass

## Testing Strategy

- Framework: Node built-in test runner (`node:test`) consistent with existing `tests/` suite
- **Footprint accumulation**: mock two sequential `build`+`fix` steps each dirtying distinct files; assert `touched.json` contains the union, sorted and deduplicated
- **In-footprint commit**: stage a `src/` file that appears in `touched.json`; assert no `commit.scope_warning` event in emitted events
- **Out-of-footprint commit**: stage a `src/` file absent from `touched.json`; assert `commit.scope_warning` emitted with that file listed; assert commit was not blocked (staging proceeded)
- **Halt path removed**: grep-based assertion or structural invariant that `commit-scope-guard-loop` string does not appear in `src/`
- Add coverage to `tests/commit-cycle.test.ts` and `tests/run-cycle.test.ts`

## Documentation Updates

- **docs/ENGINE.md**: Document `touched.json` schema (`{ "files": string[] }`), artifact-dir location (`.cycle/artifacts/<cycle-id>/touched.json`), accumulation semantics (union across steps, never overwritten within a cycle), and the `commit.scope_warning` log event shape
- **CLAUDE.md**: No command or convention changes required; scope guard halt path removal is internal
- **README.md**: No user-visible change

## Dependencies

- `git` available in PATH (already a project runtime dependency)
- `.cycle/artifacts/<cycle-id>/` directory created by existing artifact-dir setup in `run-cycle.ts` before the first mutating step
- Snapshot helper in `run-cycle.ts` (~line 287) must be callable for `build` and `fix` steps without refactoring its call site
