# Research: Cycle 0241

## Cycle Context

Cycle 0241 fixes two silent gaps where newly-created untracked (`??`-status) `src/` and `scripts/` files are excluded from the touched.json footprint and the commit-time scope-warning check. `parseSnapshotPaths` in `run-cycle.ts:40-55` explicitly skips `??` lines, so files created by an agent during a build/fix step are absent from `touched.json`. In `commit-cycle.ts:137`, the scope-warning loop also short-circuits on `xy === "??"`, meaning newly-created out-of-scope files never emit `commit.scope_warning`. The fix: extend `parseSnapshotPaths` to emit `??` paths under `src/` and `scripts/`, and remove the `??` skip in the scope-warning loop.

## Current Codebase State

### Relevant Components

- **`parseSnapshotPaths`**: pure function, not exported — `src/engine/run-cycle.ts:40-55`. Iterates `git status --porcelain` lines; line 45 is the exact skip: `if (xy === "??") continue;`. For non-`??` lines, handles rename/copy (`R`/`C`) arrow expansion at lines 47-50. Strips surrounding quotes at line 51. Returns a `Set<string>`.
- **`accumulateTouchedFiles`**: `src/engine/run-cycle.ts:102-127`. Calls `parseSnapshotPaths` on the pre-step snapshot (line 107) and a fresh `git status --porcelain` post-step (line 114). Diffs the two: paths in post but not in pre and not denied. Merges into `touched.json`.
- **`appendDocumentationPaths`**: `src/engine/run-cycle.ts:57-100`. Also calls `parseSnapshotPaths` twice (lines 76, 84) for documentation step delta tracking. Currently also affected by the `??` skip, but this function is **out of scope** for this cycle.
- **Scope-warning loop in `commitCycle`**: `src/engine/commit-cycle.ts:131-150`. Reads `touched.json` from `opts.artifactDir` (lines 122-129), then runs `git status --porcelain` (line 132) and iterates lines 134-147. Line 137: `if (xy === "??" || xy[0] === "D" || xy[1] === "D") continue;` — the `xy === "??"` guard is the target change. Lines 139-143 handle rename/copy expansion and quote stripping. Line 145 filters to `src/` and `scripts/` paths only. Line 146 checks against `touchedFiles`.
- **`RESET_ELIGIBLE_STEPS`**: exported constant — `src/engine/run-cycle.ts:27`. Current set: `build`, `fix`, `final_fix`, `quick_fix`, `test_fix`, `test_build`. `accumulateTouchedFiles` is called at line 400 inside the `RESET_ELIGIBLE_STEPS.has(step.name)` branch.
- **`stageFiles`** (in `commit-cycle.ts:25-68`): already uses `--untracked-files=all` at line 42 and does NOT skip `??` lines — it stages new files. This function is out of scope and requires no change.
- **`isDenied`**: `src/engine/path-utils.ts`. Used in `accumulateTouchedFiles:115` and `commitCycle scope-warning loop:144` to filter denylisted paths. No change needed.

### Existing Patterns to Follow

- **`??` line structure**: `git status --porcelain` `??` lines have `xy = "??"` and `raw.slice(3)` gives the path. Untracked paths never have rename arrows (`->`) and never need quote-stripping in practice, but the existing quote-strip pattern (`p.replace(/^"/, "").replace(/"$/, "")`) may be applied defensively. They have no index/worktree status complexity.
- **Path prefix filter**: the scope-warning loop already filters with `!p.startsWith("src/") && !p.startsWith("scripts/")` at line 145. The same filter pattern should be applied inside `parseSnapshotPaths` for `??` paths, ensuring untracked paths outside `src/`/`scripts/` remain excluded.
- **`D` deletion skip**: line 137 in `commit-cycle.ts` skips deleted files (`xy[0] === "D" || xy[1] === "D"`). Untracked `??` files can never represent deletions, so removal of the `??` skip does not interact with the deletion skip.
- **Pre/post snapshot diff for accumulation**: the mechanism in `accumulateTouchedFiles` requires paths to be absent from the pre-snapshot and present in the post-snapshot. A newly-created untracked file will only appear in the post-snapshot (not yet tracked at step start), so the diff logic picks it up with no further changes once `parseSnapshotPaths` emits it.
- **Best-effort wrapping**: `accumulateTouchedFiles` is called inside a `try { ... } catch { /* best-effort */ }` block at `run-cycle.ts:399-401`. No change to error-handling contract needed.
- **Test file per topic**: existing test files are organized by feature area. `tests/engine/run-cycle.touched-json.test.ts` covers `accumulateTouchedFiles` via `runCycle` integration. `tests/engine/commit-cycle.test.ts` covers `commitCycle` scope-warning via git repo setup.

### Dependencies & Integration Points

- `parseSnapshotPaths` is called in three places in `run-cycle.ts`: lines 76, 84 (`appendDocumentationPaths`), and lines 107, 114 (`accumulateTouchedFiles`). A change to `parseSnapshotPaths` affects all call sites. `appendDocumentationPaths` uses the same pre/post diff pattern; including `??` paths there would also make doc-step delta tracking more complete, but the SPEC marks this out of scope.
- `commitCycle` scope-warning loop does not call `parseSnapshotPaths`; it has its own inline porcelain parsing. The `??` skip must be removed there independently.
- `parseSnapshotPaths` is not currently exported. The SPEC's testing strategy suggests exporting it for direct unit testing, or testing indirectly through `runCycle` integration tests.
- `isDenied` (`src/engine/path-utils.ts`) is applied after path extraction in both `accumulateTouchedFiles` and the scope-warning loop. For `??` paths, it must also apply after the new `src/`/`scripts/` prefix filter.

### Test Infrastructure

- **Test framework**: Node built-in `node:test` with `assert` strict mode. No transpile step (`--experimental-strip-types`). Tests import `.ts` files directly.
- **Test conventions**: one `test(...)` per scenario, descriptive names, real git repos via `mkdtemp`/`spawnSync("git", ...)`. No mock of `spawnSync` — tests use fake binaries (`chmod 0o755` scripts in a temp `bin/` dir) to control agent behavior.
- **Helper**: `tests/helpers.ts:expectExactlyOne(events, eventName)` — asserts exactly one match and returns the event payload.
- **`run-cycle.touched-json.test.ts`**: two integration tests using `runCycle` with a fake `claude` binary that creates files and runs `git add`. Both tests use `setupGitRepo` to create a repo with `src/existing.ts` committed, then observe `touched.json`. No existing test covers untracked (`??`) files.
- **`commit-cycle.test.ts`**: five scope-warning tests at lines 426-590 using `setupRepo` + real git operations. Tests stage files then call `commitCycle` directly. No existing test covers `??`-status paths in the scope-warning check.
- **Coverage floors**: `src/engine/run-cycle.ts` floor is **90%** (`scripts/coverage-gate.mjs:29`); `src/engine/commit-cycle.ts` floor is **95%** (`scripts/coverage-gate.mjs:15`). Coverage is measured via `npm run test:coverage` (LCOV-driven `check:coverage`).

## Code References

- `src/engine/run-cycle.ts:40-55` — `parseSnapshotPaths`: the `??` skip at line 45
- `src/engine/run-cycle.ts:102-127` — `accumulateTouchedFiles`: calls `parseSnapshotPaths` at lines 107, 114
- `src/engine/run-cycle.ts:57-100` — `appendDocumentationPaths`: also calls `parseSnapshotPaths` (out of scope for this cycle)
- `src/engine/run-cycle.ts:398-402` — `accumulateTouchedFiles` call site inside `RESET_ELIGIBLE_STEPS` branch
- `src/engine/commit-cycle.ts:131-150` — scope-warning loop; `??` skip at line 137
- `src/engine/commit-cycle.ts:122-129` — `touched.json` read into `touchedFiles` set
- `src/engine/path-utils.ts` — `isDenied` denylist helper, used at `run-cycle.ts:115` and `commit-cycle.ts:144`
- `tests/engine/run-cycle.touched-json.test.ts:51-153` — two existing integration tests; no `??` coverage
- `tests/engine/commit-cycle.test.ts:426-590` — five existing scope-warning tests; no `??` coverage
- `tests/helpers.ts:3-10` — `expectExactlyOne` helper
- `scripts/coverage-gate.mjs:15,29` — per-file coverage floors for the two change targets
- `docs/ENGINE.md:167` — "Known limitation" block for `??` untracked exclusion (to be removed/updated)

## Open Questions

- `parseSnapshotPaths` is currently unexported. The SPEC's unit-testing approach requires either exporting it or testing indirectly via `runCycle`. Exporting adds a small public API surface; testing indirectly requires a full git repo setup per test. The planner must choose which approach to use and whether to add `export` to the function.
- The `appendDocumentationPaths` function also calls `parseSnapshotPaths` for its own pre/post diff. If `parseSnapshotPaths` is extended to emit `??` paths, the doc-step delta tracking also silently gains `??` coverage. The planner should confirm this side-effect is acceptable (or add a path-prefix filter argument to keep behaviors separate), given the SPEC marks `appendDocumentationPaths` as out of scope.
- The scope-warning loop in `commit-cycle.ts` currently skips `D`-status deletions (line 137) alongside `??`. After removing `??` from that guard, the remaining condition is `xy[0] === "D" || xy[1] === "D"`. The planner should confirm deletion skipping is still correct and intentional after the `??` removal.
