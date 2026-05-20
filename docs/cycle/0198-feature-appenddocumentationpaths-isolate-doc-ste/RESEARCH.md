I have everything needed. Writing the research document now.

```markdown
# Research: Cycle 0198

## Cycle Context

SPEC asks for `appendDocumentationPaths` to accept a `preSnapshot: string` parameter containing `git status --porcelain` output captured immediately before the documentation step executes. The function must diff pre/post snapshots and only append delta paths (present in post, absent in pre) to `BUILD.md ## Touched Files`. All existing denylist, rename-handling, deduplication, and `documentation.paths_appended` emission logic is preserved unchanged.

## Current Codebase State

### Relevant Components

- **`appendDocumentationPaths` function**: `src/engine/run-cycle.ts:47–100`
  - Signature: `async function appendDocumentationPaths(repoRoot: string, buildMdPath: string, log: Logger, cycleId: string): Promise<void>`
  - Reads `BUILD.md` at `buildMdPath`; finds `## Touched Files` section; builds `touchedSet` from existing bullets (lines 55–64)
  - Calls `spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", shell: false })` internally at lines 66–71 — this is the post-step snapshot
  - Iterates porcelain lines: skips `??` (untracked), extracts rename destination for `R`/`C` prefixes, strips surrounding quotes (lines 73–85)
  - Filters via `isDocAppendDenied(p)` and `touchedSet.has(p)` before pushing to `toAppend` (lines 83–84)
  - Splices new `- <path>` bullets into `lines` and writes back (lines 88–98)
  - Emits `documentation.paths_appended { cycle_id, appended }` at line 99

- **`isDocAppendDenied` function**: `src/engine/run-cycle.ts:37–45`
  - Denylist prefixes: `.claude`, `dist`, `node_modules` (line 34)
  - Denylist exact: `.cycle/cycle.pid` (line 35)
  - Rejects `.lock` suffix files (line 43)
  - Pure function; unchanged by this cycle

- **Call site**: `src/engine/run-cycle.ts:336–339`
  ```ts
  if (r.status === "ok" && step.name === "documentation") {
    try {
      await appendDocumentationPaths(repoRoot, join(artifactDir, "BUILD.md"), log, cycleId);
    } catch { /* best-effort append; never fail the cycle */ }
  }
  ```
  The pre-snapshot must be captured between `step.start` emission (line 277) and the agent dispatch (lines 284–296), i.e., immediately before step execution begins.

- **Step dispatch block**: `src/engine/run-cycle.ts:277–296`
  - `step.start` emitted at line 277
  - Bash steps dispatched via `execBashStep` at line 285
  - Non-bash steps dispatched via `resolveAgent(step.agent).runStep(...)` at line 289
  - Pre-snapshot capture must occur after `step.start` but before these dispatch calls

- **`spawnSync` import**: `src/engine/run-cycle.ts:24` — already imported from `node:child_process`; the same call pattern used at line 321 (`git diff HEAD -- src/`) can be reused for the pre-snapshot

- **Test file**: `tests/engine/run-cycle.documentation.test.ts` — 561 lines, 10 tests
- **ENGINE.md documentation step section**: `docs/ENGINE.md:72–76` — line 76 describes the current single-snapshot behavior; must be updated to describe pre/post diff

### Existing Patterns to Follow

- **`spawnSync` for git**: `src/engine/run-cycle.ts:66–71` and `320–325` — pattern: `spawnSync("git", [...args], { cwd: repoRoot, encoding: "utf8", shell: false })`, read `result.stdout ?? ""`; no `shell: true`

- **Pre-snapshot read at call site**: The diff guard at lines 320–330 shows the pattern of capturing a git command result just before or after a step and using it inline. The pre-snapshot follows the same pattern, captured just before step dispatch.

- **Porcelain line parsing**: `src/engine/run-cycle.ts:73–85` — split on `"\n"`, skip empty, check XY prefix, extract rename destination, strip quotes. Same logic applies when building the pre-path set from `preSnapshot`.

- **`expectExactlyOne` helper**: `tests/helpers.ts` — imported at test file line 8; used for cardinality-pinned event assertions throughout the test file

- **`setupBuildDocWorkflow` helper**: `tests/engine/run-cycle.documentation.test.ts:252–296`
  - Creates build + documentation step workflow with dispatching wrapper
  - Build fake (`claude-build`): creates `src/dummy.ts`, stages it, prints `buildTouchedFiles` to stdout
  - Doc fake (`claude-doc`): appends to `README.md`, prints summary
  - Dispatch wrapper: branches on `$3` (prompt content) containing `DOCUMENTATION_STEP_PROMPT`
  - New test for pre-existing dirty paths can extend this pattern or write a custom setup that stages an extra undeclared file

- **Test isolation pattern**: Each test uses `mkdtemp` for `root` and `bin`, `setupGitRepo` or `setupGitRepoWithReadme`, and `rm(root/bin, { recursive: true, force: true })` in `finally`

### Dependencies & Integration Points

- `appendDocumentationPaths` is a module-private function — not exported; only called at `run-cycle.ts:338`
- `spawnSync` already imported; no new imports needed
- `Logger` and `cycleId` already in scope at the call site
- `repoRoot` already in scope at the call site
- The pre-snapshot is a `string` (raw `result.stdout`) — no new types required

### Test Infrastructure

- **Framework**: Node built-in `node:test` with `--experimental-strip-types` (Node ≥ 22.6, no transpile)
- **Test file**: `tests/engine/run-cycle.documentation.test.ts`
- **Helpers**: `tests/helpers.ts` exports `expectExactlyOne(events, eventName)` — asserts `length === 1`, returns payload
- **Coverage gate**: `scripts/coverage-gate.mjs` enforces per-file floors; `src/engine/run-cycle.ts` is not in the explicit `FLOORS` table but falls under the global Line ≥ 95%, Branch ≥ 75%, Function ≥ 90% baseline
- **Running tests**: `npm test` (builds first); `npm run test:coverage` for LCOV; `npm run typecheck` for zero-error check
- **Existing tests touching `appendDocumentationPaths` (indirectly, via `runCycle`)**:
  - Line 298: appends modified tracked file absent from Touched Files
  - Line 323: no duplicate when path already in Touched Files
  - Line 387: rename destination extracted from R-prefix porcelain line
  - Line 447: no-op when BUILD.md has no `## Touched Files` section
  - Line 474: no-op when BUILD.md absent
  - Line 509: `documentation.paths_appended` emitted with correct `cycle_id` and `appended`
  - Line 537: `documentation.paths_appended` not emitted when delta empty
- All 7 tests above will need a `preSnapshot` threaded through once the signature changes — but since `preSnapshot` is captured at the call site in `run-cycle.ts` (not in the test directly), tests continue exercising `runCycle` end-to-end and do not call `appendDocumentationPaths` directly. The pre-snapshot will be captured automatically during `runCycle` execution. No test-level API change is needed for existing tests.

## Code References

- `src/engine/run-cycle.ts:34–35` — `DOC_APPEND_DENYLIST_PREFIXES` and `DOC_APPEND_DENYLIST_EXACT` constants
- `src/engine/run-cycle.ts:37–45` — `isDocAppendDenied(p: string): boolean`
- `src/engine/run-cycle.ts:47` — `appendDocumentationPaths` signature (to be updated)
- `src/engine/run-cycle.ts:55–64` — build `touchedSet` from existing Touched Files bullets
- `src/engine/run-cycle.ts:66–71` — current `spawnSync` call for post-step porcelain (to be made post-step; pre-step capture moves to call site)
- `src/engine/run-cycle.ts:73–85` — porcelain line iteration, rename handling, denylist filter, dedup filter
- `src/engine/run-cycle.ts:87–98` — splice + writeFile; unchanged
- `src/engine/run-cycle.ts:99` — `log.emit("documentation.paths_appended", ...)` — unchanged
- `src/engine/run-cycle.ts:277–282` — `step.start` emission (pre-snapshot must be captured after this, before dispatch)
- `src/engine/run-cycle.ts:283–296` — step dispatch (`execBashStep` / `resolveAgent(...).runStep(...)`)
- `src/engine/run-cycle.ts:336–339` — `appendDocumentationPaths` call site (to pass `preSnapshot`)
- `tests/engine/run-cycle.documentation.test.ts:252–296` — `setupBuildDocWorkflow` helper; shows how build fake stages `src/dummy.ts`
- `tests/engine/run-cycle.documentation.test.ts:509–535` — `documentation.paths_appended` emission test; the new pre-existing-dirty-path test follows this same shape
- `docs/ENGINE.md:72–76` — documentation step section; line 76 describes single-snapshot behavior to be updated

## Open Questions

1. **Scope of pre-snapshot in the step loop**: The step loop iterates all steps. The pre-snapshot should only be captured when `step.name === "documentation"` (to avoid an unnecessary `spawnSync` on every step). The planner should confirm whether to guard the capture with `if (step.name === "documentation")` before dispatch, or capture unconditionally and only use it conditionally.

2. **Pre-snapshot variable scope**: The capture happens inside the step loop body. The planner should confirm the variable is declared inside the loop (local to each iteration) rather than hoisted above the loop, to avoid stale values if step ordering ever changes.

3. **New test fake setup**: The new "pre-existing dirty paths excluded" test needs a build fake that stages an undeclared file (not in Touched Files). The planner should decide whether to extend `setupBuildDocWorkflow` with a parameter or write a new bespoke setup, keeping in mind that `setupBuildDocWorkflow` already pins `buildTouchedFiles` as a parameter.
```
