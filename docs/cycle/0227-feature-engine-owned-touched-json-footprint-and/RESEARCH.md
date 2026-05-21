I now have all the information needed. Writing the research document.

# Research: Cycle 0227

## Cycle Context

This cycle replaces the blocking `scopeGuard` in `commit-cycle.ts` — which halts cycles when agent-authored `BUILD.md` footprints drift from actual file changes — with two cooperating mechanisms: (1) an engine-computed `touched.json` built from real `git status --porcelain` deltas around `build` and `fix` steps in `run-cycle.ts`, accumulated into `.cycle/artifacts/<cycle-id>/touched.json`; and (2) a non-blocking `commit.scope_warning` event emitted when staged `src/`/`scripts/` files are absent from `touched.json`. The existing blocking `throw`/early-return on scope violation, the `scopeGuardViolations` counter, and the `commit-scope-guard-loop` halt path are deleted from `cli.ts` entirely.

## Current Codebase State

### Relevant Components

**`src/engine/commit-cycle.ts`** — The file containing all code to be changed:
- `parseTouchedFiles(buildMdPath)` — reads `## Touched Files` section from `BUILD.md`; returns `string[] | null` — `commit-cycle.ts:15`
- `scopeGuard(repoRoot, cycleId, envExtra)` — finds the cycle's `docs/cycle/<id>-*/BUILD.md`, calls `parseTouchedFiles`, compares dirty `src/`/`scripts/` files against that list, returns array of blocked file paths — `commit-cycle.ts:35`
- `stageFiles(repoRoot, envExtra)` — stages all dirty files (skipping gitlinks and denied paths), returns `boolean` (whether anything staged) — `commit-cycle.ts:83`
- `buildClosesBlock(...)` — reads GitHub issue URLs from todo file, builds `Closes #N` lines — `commit-cycle.ts:128`
- `commitCycle(repoRoot, opts)` — the main export; calls `scopeGuard` first and returns `{ status: "failed", reason: "scope_violation", blockedFiles }` early if any blocked files are found, then calls `stageFiles`, commits, pushes — `commit-cycle.ts:164`
- `CommitResult` union type includes `{ status: "failed"; reason: "scope_violation"; blockedFiles: string[] }` — `commit-cycle.ts:9`
- `spawnGit(args, cwd, envExtra)` — internal helper using `buildChildEnv` — `commit-cycle.ts:73`

**`src/engine/run-cycle.ts`** — The file where footprint accumulation will be added:
- `appendDocumentationPaths(repoRoot, buildMdPath, log, cycleId, preSnapshot)` — the exact pre/post snapshot pattern to be reused; takes a `preSnapshot` string (result of `git status --porcelain` before the step), does a post-step snapshot, diffs them to find newly-dirtied files, appends to `BUILD.md`'s `## Touched Files` section — `run-cycle.ts:40`
- Pre-snapshot capture for `documentation` step only: `if (step.name === "documentation")` block at `run-cycle.ts:293`; snapshot taken as `spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", shell: false })` and stored in `preSnapshot` local variable
- `RESET_ELIGIBLE_STEPS` — `Set(["build", "fix"])` — `run-cycle.ts:27`; these are the exact steps where footprint snapshots need to be captured
- `ARTIFACT_STEPS` — `Set(["spec", "research", "plan", "build", "review", "fix", "documentation"])` — `run-cycle.ts:35`
- `artifactDir` — resolved per-cycle path `docs/cycle/<cycleId>-<workflow>-<slug>/`, set before the step loop at `run-cycle.ts:190–210`; created by `prepareTrunkArtifactDir` (trunk mode) or `checkoutCycleBranch` (worktree-pr mode) — both in `branch.ts`
- Imports include `writeFile`, `readFile` from `node:fs/promises` and `spawnSync` from `node:child_process` — `run-cycle.ts:21–24`
- `isDenied(p)` from `path-utils.ts` already imported and used in `appendDocumentationPaths` — `run-cycle.ts:25`

**`src/cli.ts`** — The supervisor where the halt counter lives:
- `scopeGuardViolations` — `Map<string, number>` initialized at `cli.ts:177`
- Two sites where `scope_violation` is checked and the counter incremented:
  - Resume path at `cli.ts:380–391`: after `commitCycle` returns `scope_violation`, increments counter; if `count >= 2` emits `engine.paused { reason: "commit-scope-guard-loop" }` and returns `{ outcome: "scope-guard-loop" }`
  - Main drain loop at `cli.ts:496–507`: same pattern, sets `halted = true; break`
- `ResumeOutcome` type includes `"scope-guard-loop"` — `cli.ts:33`
- `scopeGuardViolations.delete(cycleId)` on successful commit at `cli.ts:401` and `cli.ts:525`
- After resume loop: `else if (result.outcome === "scope-guard-loop") { halted = true; }` at `cli.ts:429`
- `haltReason` union type `"max_consecutive_failures" | "triage_failed" | null` — does **not** include `"commit-scope-guard-loop"` (that halt path sets `halted = true` without setting `haltReason`)

**`src/engine/branch.ts`** — Creates the artifact directory:
- `prepareTrunkArtifactDir(repoRoot, opts)` — trunk mode: creates `docs/cycle/<cycleId>-<workflow>-<slug>/`, returns `{ artifactDir }` — `branch.ts:58`
- `createCycleBranch(repoRoot, opts)` — worktree-pr mode: creates branch + same artifact dir pattern — `branch.ts:25`
- The artifact dir is created with `mkdir(artifactDir, { recursive: true })` before the step loop begins — `branch.ts:37,45,60`

**`src/engine/log.ts`** — Logger used by `commitCycle` and `run-cycle`:
- `Logger` type: `{ emit: (event: string, fields: Record<string, unknown>) => Promise<void> }` — `log.ts:4`
- `emit` appends `JSON.stringify({ ts, event, ...fields }) + "\n"` to `.cycle/log.jsonl` — `log.ts:12`
- `commitCycle` currently does **not** receive a `Logger` parameter; it has no log emit capability today

**`src/engine/path-utils.ts`** — `isDenied(p)` helper:
- Used in both `appendDocumentationPaths` and `scopeGuard` to filter denylist paths — imported in both `run-cycle.ts:25` and `commit-cycle.ts:7`

### Existing Patterns to Follow

**Pre/post snapshot pattern** (`appendDocumentationPaths`, `run-cycle.ts:40–108`):
1. Record pre-snapshot: `spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", shell: false })`
2. Run step
3. Record post-snapshot: same `spawnSync` call
4. Parse both snapshots: strip `??` untracked lines, extract path from XY prefix + rename arrow (`->`)
5. Compute set difference: files in post not in pre
6. Filter with `isDenied(p)`
7. Act on the diff

**File accumulation with union semantics**: `appendDocumentationPaths` avoids duplicates by checking `touchedSet.has(p)` before appending. The `touched.json` design calls for the same deduplication pattern across multiple steps.

**Artifact dir path convention**: `join(repoRoot, "docs", "cycle", "${cycleId}-${workflow}-${slug}")` — `branch.ts:36,44,59`. In `run-cycle.ts`, `artifactDir` variable holds this path and is available throughout the step loop.

**SpawnSync git without shell**: `spawnSync("git", [...], { cwd, encoding: "utf8", shell: false })` — used in `run-cycle.ts:73–77` and `commit-cycle.ts:79`. Always array args, never `shell: true`.

**`buildChildEnv` wrapping**: `spawnGit` in `commit-cycle.ts` wraps calls with `buildChildEnv(envExtra ?? {})` — `commit-cycle.ts:78`. The raw `spawnSync` calls in `run-cycle.ts` do not pass `envExtra` (they use the ambient process env).

**Log event emission via `log.emit`**: all log events flow through the `Logger` instance. In `run-cycle.ts`, `log` is defined at `run-cycle.ts:182` and is available throughout. `commitCycle` currently has no access to a logger.

**`appendLog` vs `log.emit`**: the codebase uses `log.emit` everywhere (via `Logger`); there is no standalone `appendLog` function exported from `log.ts`. The SPEC references `appendLog` but the actual pattern is `log.emit`.

### Dependencies & Integration Points

- `commit.scope_warning` must land in `.cycle/log.jsonl`. Currently `commitCycle` takes no `Logger` parameter. The planner must either: (a) add a `log` parameter to `commitCycle` and thread a `Logger` from both `cli.ts` call sites, or (b) have `commitCycle` return the warning in its result and have `cli.ts` emit it. Both call sites for `commitCycle` are `cli.ts:373` (resume path) and `cli.ts:489` (main drain loop).

- `touched.json` path: `.cycle/artifacts/<cycle-id>/touched.json` per SPEC. But existing artifact dir in the code is `docs/cycle/<cycleId>-<workflow>-<slug>/`. The SPEC says `.cycle/artifacts/<cycle-id>/` but the issue file says the artifact dir is `docs/cycle/...`. These two locations are inconsistent — the planner must resolve which path is authoritative. The `artifactDir` variable in `run-cycle.ts` points to `docs/cycle/...`, not `.cycle/artifacts/...`. There is no `.cycle/artifacts/` directory in the codebase.

- `commitCycle` needs to read `touched.json`. It must know the `artifactDir` path. Currently `commitCycle` locates the cycle dir by scanning `docs/cycle/` for a `<cycleId>-*` match — `commit-cycle.ts:42–45`. Reading `touched.json` from that same dir would follow the same pattern (or from `.cycle/artifacts/<cycleId>/` if that convention is chosen).

- The `build` and `fix` pre-snapshot capture must happen at `run-cycle.ts:292–296` where the `documentation` snapshot is currently captured, but gated on `step.name === "build" || step.name === "fix"` instead of `step.name === "documentation"`.

- `RESET_ELIGIBLE_STEPS.has(step.name)` (`build`, `fix`) already aligns with the mutating step set — the guard condition for snapshot capture can reuse `RESET_ELIGIBLE_STEPS`.

### Test Infrastructure

- **Framework**: Node built-in `node:test`; imports `test` from `"node:test"` and `assert` from `"node:assert"` with `strict` mode
- **Test directory**: `tests/engine/` for engine unit/integration tests, `tests/cli/` for CLI-level integration tests
- **Existing commit-cycle tests**: `tests/engine/commit-cycle.test.ts` — unit tests for `parseTouchedFiles`, `scopeGuard`, `stageFiles`, `buildClosesBlock`, and `commitCycle`; uses `mkdtemp` + real `git init` + fake `sh` bins via a `writeFakeBin` helper
- **Existing scope-guard halt tests**: `tests/cli/scope-guard-halt.test.ts` — integration tests that spawn `dist/cycle.js` directly; tests the `engine.paused { reason: "commit-scope-guard-loop" }` event and `exit 1` behavior; uses bash scripts that manipulate the working tree
- **Existing run-cycle documentation tests**: `tests/engine/run-cycle.documentation.test.ts` — tests for `appendDocumentationPaths`; uses `setupBuildDocWorkflow` helper that creates fake `claude` binaries dispatched by prompt content; the `preSnapshot` pattern is tested here
- **`expectExactlyOne` helper**: `tests/helpers.ts:3` — asserts exactly one matching event and returns it; required by CLAUDE.md for exactly-once events
- **Fake binary pattern**: tests create `sh` scripts in a temp `bin/` dir and inject via `PATH` override in `env`; for multi-step workflows, a dispatcher script selects the right fake by inspecting the last CLI argument (prompt content)
- **Per-file coverage floors**: `commit-cycle.ts` at 95%, `run-cycle.ts` not currently in `FLOORS` table (no explicit floor; subject to aggregate thresholds: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)

## Code References

- `src/engine/commit-cycle.ts:9` — `CommitResult` union type; `scope_violation` variant to be removed
- `src/engine/commit-cycle.ts:13` — `CommitResult` `scope_violation` variant: `{ status: "failed"; reason: "scope_violation"; blockedFiles: string[] }`
- `src/engine/commit-cycle.ts:15–33` — `parseTouchedFiles` function (reads `BUILD.md`; not deleted but no longer the footprint source for the guard)
- `src/engine/commit-cycle.ts:35–71` — `scopeGuard` function to be replaced/demoted
- `src/engine/commit-cycle.ts:164–204` — `commitCycle`: blocking call to `scopeGuard` at line 176, early return at line 177
- `src/engine/run-cycle.ts:27` — `RESET_ELIGIBLE_STEPS = Set(["build", "fix"])` — exact set for new snapshot capture
- `src/engine/run-cycle.ts:40–108` — `appendDocumentationPaths`: the pre/post snapshot helper to extend or reuse
- `src/engine/run-cycle.ts:292–296` — current `documentation`-only pre-snapshot block; location where `build`/`fix` snapshot capture will be added
- `src/engine/run-cycle.ts:350–361` — empty-diff guard for `build`/`fix`; post-step code runs after this point
- `src/engine/branch.ts:58–62` — `prepareTrunkArtifactDir`; artifact dir created before step loop
- `src/cli.ts:33` — `ResumeOutcome` type includes `"scope-guard-loop"`
- `src/cli.ts:177` — `scopeGuardViolations` Map initialization
- `src/cli.ts:380–402` — resume path: scope_violation check, counter, `engine.paused` emit, `scopeGuardViolations.delete`
- `src/cli.ts:429–431` — resume result dispatch: `scope-guard-loop` sets `halted = true`
- `src/cli.ts:489–530` — main drain loop: scope_violation check, counter, `engine.paused` emit, `halted = true; break`
- `scripts/coverage-gate.mjs:12–29` — `FLOORS` table; `commit-cycle.ts` floor is 95%; `run-cycle.ts` has no explicit floor entry
- `tests/engine/commit-cycle.test.ts:566–604` — `commitCycle — scope_violation: stageFiles never called` test (to be deleted or repurposed)
- `tests/engine/commit-cycle.test.ts:644–687` — regression test asserting `scope_violation` result (to be deleted)
- `tests/cli/scope-guard-halt.test.ts:162–245` — three integration tests asserting `engine.paused { reason: "commit-scope-guard-loop" }` (all to be deleted)
- `tests/engine/run-cycle.documentation.test.ts:252–296` — `setupBuildDocWorkflow` helper: reusable pattern for multi-step fake-binary tests

## Open Questions

1. **`touched.json` location**: SPEC says `.cycle/artifacts/<cycle-id>/touched.json` but no such directory exists; `artifactDir` in `run-cycle.ts` resolves to `docs/cycle/<cycleId>-<workflow>-<slug>/`. The planner must decide whether to create a new `.cycle/artifacts/<cycleId>/` directory or store `touched.json` inside the existing `artifactDir`. The issue file says "cycle artifact dir" without specifying which one. Writing to `artifactDir` (already created) avoids a new directory convention; writing to `.cycle/artifacts/` matches SPEC literal but requires new `mkdir`.

2. **Logger threading into `commitCycle`**: `commitCycle` has no `Logger` parameter today. For `commit.scope_warning` to reach `.cycle/log.jsonl`, either `commitCycle` must gain a `log` parameter (requiring two call-site updates in `cli.ts`) or it must return the warning in its result (requiring `cli.ts` to emit the event). The planner must choose one approach.

3. **`parseTouchedFiles` fate**: it is exported, has tests, and is still callable. After this cycle, it has no caller inside `commitCycle`. The planner must decide whether to delete it (breaking its tests) or leave it in place as dead code.

4. **`run-cycle.ts` coverage floor**: there is no per-file floor entry for `run-cycle.ts` in `FLOORS`. The planner must decide whether to add one as part of this cycle (SPEC says "maintained" but no floor exists to maintain).
