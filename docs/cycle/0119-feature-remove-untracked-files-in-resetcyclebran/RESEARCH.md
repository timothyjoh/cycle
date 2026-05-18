I have everything needed. Writing the research document.

```markdown
# Research: Cycle 0119

## Cycle Context

SPEC asks for `git clean -fd` added after `git reset --hard` inside `resetCycleBranchTo` in `src/engine/branch.ts`, gated behind the existing `cycle/` branch guard. The clean must use `-fd` (not `-fdx`) to preserve gitignored engine state (`dist/`, `node_modules/`, `.cycle/`). A non-zero exit from `git clean` must surface as a warning (same observable pattern as existing `build_pre_sha_missing` / `fix_pre_sha_missing` warnings), not throw or be silently swallowed. New tests must cover: untracked removal, branch guard, gitignored survival. ENGINE.md must be updated.

## Current Codebase State

### Relevant Components

- **`resetCycleBranchTo`** — the sole change target. Checks `currentBranchName`, guards on `startsWith("cycle/")`, then calls `git reset --hard sha`. No `git clean` call exists. — `src/engine/branch.ts:96-102`
- **`git` private helper** — spawns git with array args (no `shell`), rejects on non-zero exit via `new Error(...)`. Single code path; no non-throwing variant. — `src/engine/branch.ts:5-15`
- **`RESET_ELIGIBLE_STEPS`** — `Set(["build", "fix"])`, determines which steps participate in the reset policy. — `src/engine/run-cycle.ts:24`
- **Reset call site in `runCycle`** — calls `resetCycleBranchTo(repoRoot, prior)` only when `isResetEligible && cfg.engine.commit.mode === "worktree-pr"` and the prior SHA is valid. — `src/engine/run-cycle.ts:193`
- **Warning emission in `runCycle`** — `log.emit("step.warning", { ..., reason: "build_pre_sha_missing" | "build_pre_sha_unreachable" | ... })` — these live in `run-cycle.ts` and use the `log` logger created at the top of `runCycle`. `branch.ts` has no logger access. — `src/engine/run-cycle.ts:187-190`

### Existing Patterns to Follow

- **Branch guard pattern**: `currentBranchName` (async, returns `string | null`) checked with `startsWith("cycle/")` before any destructive git op; throw with message `"resetCycleBranchTo refuses to reset outside a cycle branch (HEAD=<branch|unknown>)"`. — `src/engine/branch.ts:97-100`
- **subprocess discipline**: always `spawn` with array args, `shell: false`. The `git` helper follows this. `git clean` must follow the same pattern. — `src/engine/branch.ts:5-15`, `CLAUDE.md`
- **Warning-not-throw pattern**: existing `_pre_sha_missing` / `_pre_sha_unreachable` cases do NOT throw — they emit `step.warning` via logger and continue. The clean failure must follow this (not throw, not silently continue). — `src/engine/run-cycle.ts:186-191`
- **`git` helper returns `void`**: the helper resolves `void` on success and rejects on failure. There is no existing non-throwing variant that returns stdout/stderr. — `src/engine/branch.ts:5-15`

### Dependencies & Integration Points

- **`branch.ts` → `run-cycle.ts`**: `resetCycleBranchTo` is exported and called in `runCycle`. Warning emission lives in `run-cycle.ts` (has `log`); `branch.ts` has no logger. To surface a `git clean` failure as a `step.warning`, either (a) `resetCycleBranchTo` must return a warning indicator and `runCycle` emits it, or (b) `resetCycleBranchTo` receives a callback/logger, or (c) the clean is called separately from `run-cycle.ts` after `resetCycleBranchTo`. — `src/engine/run-cycle.ts:193`, `src/engine/branch.ts:96-102`
- **`currentBranchName`** — async, used inside `resetCycleBranchTo` already. Returns `null` when not a git repo or spawn error. — `src/engine/branch.ts:82-90`
- **`.gitignore`**: `node_modules/`, `dist/`, `.cycle/log.jsonl`, `.cycle/tbd.jsonl`, `.cycle/cycle.pid`, `.cycle/.sync-state.json`, `.cycle/coverage.lcov` are gitignored. `-fd` respects `.gitignore` and will NOT remove these. `-fdx` would remove them, breaking the engine mid-run. — `.gitignore`

### Test Infrastructure

- **Framework**: Node.js native test runner (`node:test`, `node:assert`). No transpile step; `--experimental-strip-types`. — `CLAUDE.md`
- **Test conventions**: one or more `test()` calls per file, real temp git repos via `mkdtemp`, `spawnSync` for sync git ops, `async/await` throughout, `try/finally` for cleanup with `rm(root, { recursive: true, force: true })`. — `tests/engine/branch.test.ts:1-14`
- **Import style**: named imports from source `.ts` files directly (e.g., `import { resetCycleBranchTo } from "../../src/engine/branch.ts"`). — `tests/engine/branch.test.ts:8`
- **Fake agent binary pattern**: `mkdtemp` bin dir, write executable bash script as `claude`, inject via `PATH` env. Used in run-cycle integration tests. — `tests/engine/run-cycle.test.ts:1088-1092`
- **`workflowYmlBranch` helper**: test helper in run-cycle.test.ts for building workflow YAML with `commit.mode: worktree-pr`. — `tests/engine/run-cycle.test.ts` (used at 1052-1062, 1274-1293)

### Current coverage of the change area

- **Existing `resetCycleBranchTo` unit tests** — `tests/engine/branch.test.ts:258-328`:
  - Line 258: "resetCycleBranchTo discards staged + unstaged + untracked changes back to a SHA" — seeds `untracked.txt`, then **asserts `stillThere == true`** (line 285-286), explicitly documenting the current behavior where untracked files survive. This assertion will need to flip after the fix.
  - Line 292: "resetCycleBranchTo refuses to run outside a cycle/ branch" — covers guard path.
  - Line 311, 323: null/error cases for non-git dir and nonexistent cwd.
- **"Test C" — integration test** — "resume at fix hard-resets to prior step.start head_sha" at `tests/engine/run-cycle.test.ts:1262`. Seeds `untracked.txt` at line 1322 but does **not** assert it is removed. The SPEC requires an additive assertion here.
- **"resume at build hard-resets to prior step.start head_sha"** at `tests/engine/run-cycle.test.ts:1039`. Seeds `untracked.txt` at line 1085 but also does **not** assert it is removed.

## Code References

- `src/engine/branch.ts:96-102` — `resetCycleBranchTo`: guard, then `git reset --hard sha`. Add `git clean -fd` here.
- `src/engine/branch.ts:5-15` — `git` private helper: throws on non-zero. Clean failure must not throw — needs a different handling strategy.
- `src/engine/run-cycle.ts:181-196` — reset-eligible block: guard → prior SHA lookup → `resetCycleBranchTo` call. Warning emission for clean failure would land here if returned from `resetCycleBranchTo`.
- `src/engine/run-cycle.ts:186-190` — existing `step.warning` emission pattern for `_pre_sha_missing` / `_pre_sha_unreachable`.
- `src/engine/run-cycle.ts:24` — `RESET_ELIGIBLE_STEPS = Set(["build", "fix"])`.
- `tests/engine/branch.test.ts:258-290` — existing test asserting untracked files survive (assertion at line 286 must flip).
- `tests/engine/branch.test.ts:292-309` — branch guard test: must gain assertion that untracked file still exists when guard fires.
- `tests/engine/run-cycle.test.ts:1039-1125` — "resume at build" integration test: needs additive untracked-gone assertion.
- `tests/engine/run-cycle.test.ts:1262-1362` — "resume at fix" integration test (Test C): needs additive untracked-gone assertion.
- `.gitignore` — `dist/`, `node_modules/`, `.cycle/*` are ignored. Use `dist/foo.js` as the gitignored-survival seed file in tests.

## Open Questions

1. **How does `git clean` failure surface as a `step.warning`?** `branch.ts` has no logger. Three viable approaches: (a) change `resetCycleBranchTo` signature to return `{ cleanWarning?: string }` and have `run-cycle.ts` emit the warning; (b) pass an optional `onCleanFailure` callback into `resetCycleBranchTo`; (c) call a new exported `cleanCycleBranch` from `run-cycle.ts` after `resetCycleBranchTo` and catch there. The SPEC says "same kind of warning the existing reset failure path produces" — the planner must choose the approach that keeps guard + reset + clean atomic (SPEC requirement: "no way to reset without cleaning").

2. **Does the existing branch.test.ts test at line 258 need to be restructured or just have its assertion flipped?** The test name says "discards staged + unstaged + untracked changes" — after the fix, untracked removal IS expected, so the test comment on line 286 (`"git reset --hard does not remove untracked files"`) and the assertion both need updating. The planner should confirm whether this test becomes the gitignored-survival test or a separate test is needed.

3. **`dist/` may not exist in a temp git repo during tests.** The gitignored-survival test seeds `dist/foo.js` — the planner must ensure `mkdir -p dist/` is part of the test setup, and that the temp repo's `.gitignore` actually lists `dist/` (currently the real repo's `.gitignore` does, but temp repos in tests start empty).
```
