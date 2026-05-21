# SPEC — Cycle 0241: Fix touched.json to Include Untracked New src/ Files

## Objective

`parseSnapshotPaths` in `run-cycle.ts` silently skips `??`-status lines (untracked files), meaning any newly-created `src/` or `scripts/` file that an agent creates during a build or fix step is absent from `touched.json`. The commit-cycle scope-warning check also skips `??` lines, so out-of-scope new files never trigger `commit.scope_warning`. This cycle fixes both gaps: `parseSnapshotPaths` is extended to emit untracked paths under `src/` and `scripts/`, and the scope-warning logic in `commit-cycle.ts` is updated to include `??`-status paths. `ENGINE.md` is updated to describe the corrected behavior.

## Source Issue

`refl-0227-new-untracked-src-files-bypass-touched-j` — "Fix touched.json to include untracked new src/ files, or document the gap in ENGINE.md"

## Scope

### In Scope

- Extend `parseSnapshotPaths` (`src/engine/run-cycle.ts:40`) to include `??`-status lines whose path begins with `src/` or `scripts/`.
- Remove the `xy === "??"` skip in the `commitCycle` scope-warning loop (`src/engine/commit-cycle.ts:137`) so out-of-scope untracked `src/`/`scripts/` files emit `commit.scope_warning`.
- Add or extend tests covering: untracked `src/` file in `touched.json`; untracked out-of-scope path emits `commit.scope_warning`; untracked path outside `src/`/`scripts/` is excluded.
- Update `ENGINE.md` to document the corrected footprint behavior.

### Out of Scope

- Changing `stageFiles` behavior (it already uses `--untracked-files=all` and stages new files correctly).
- Modifying `accumulateTouchedFiles` logic (the diff mechanism already works once `parseSnapshotPaths` emits `??` paths).
- Any analytics or reflection consumers of `touched.json` — no callers change.

## Requirements

- `parseSnapshotPaths` must emit paths from `??`-status lines when the path starts with `src/` or `scripts/`.
- `??`-status paths must not undergo rename/copy expansion (no `->` parsing needed for untracked paths).
- The scope-warning loop in `commitCycle` must treat `??`-status paths the same as modified paths when the path is under `src/` or `scripts/` and absent from `touched.json`.
- Untracked paths outside `src/` and `scripts/` must remain excluded from both `touched.json` and scope warnings.
- All per-file coverage floors must continue to pass; `run-cycle.ts` and `commit-cycle.ts` coverage must not decrease.

## Acceptance Criteria

- [ ] `parseSnapshotPaths` called with a `?? src/new-file.ts` line returns a set containing `src/new-file.ts`.
- [ ] `parseSnapshotPaths` called with a `?? config/foo.json` line does not include `config/foo.json`.
- [ ] `accumulateTouchedFiles` records a newly-created untracked `src/` file in `touched.json` after a build/fix step that creates it.
- [ ] `commitCycle` emits `commit.scope_warning` when a `??`-status `src/` path is not in `touched.json`.
- [ ] `commitCycle` does not emit `commit.scope_warning` for a `??`-status path outside `src/`/`scripts/`.
- [ ] `ENGINE.md` footprint section describes that untracked new files under `src/` and `scripts/` are now included.
- [ ] `npm test` passes with all existing tests green.
- [ ] `npm run check:coverage` passes; per-file floors for `run-cycle.ts` and `commit-cycle.ts` do not regress.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy

- Test framework: Node built-in `node:test` with `mock` (matches existing test conventions).
- **`parseSnapshotPaths`**: unit-test the function directly by exporting it or testing via snapshot string inputs; cover `??` path under `src/`, `??` path outside `src/`/`scripts/`, `??` path under `scripts/`, and a mix with tracked modified paths.
- **`accumulateTouchedFiles` integration**: construct a pre/post snapshot pair where a `??` path appears only in post; assert the diff accumulates it.
- **scope-warning in `commitCycle`**: mock `git status --porcelain` to return a `??`-status `src/` line; assert `commit.scope_warning` fires with that file. Separately assert `??` path outside `src/` does not trigger warning.
- No E2E or UI tests required.

## Documentation Updates

- **`docs/ENGINE.md`**: Update the `touched.json` footprint section to state that `??`-status (untracked) paths under `src/` and `scripts/` are now included. Remove or update any "Known Limitations" note if added in prior cycles.
- **`CLAUDE.md`**: No changes required.
- **`README.md`**: No changes required.

## Dependencies

- `src/engine/run-cycle.ts` and `src/engine/commit-cycle.ts` must be at the state on `master` as of cycle 0240 (current HEAD).
- No external services or env vars required.
