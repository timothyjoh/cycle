Enough context. Writing the research document now.

```markdown
# Research: Cycle 0114

## Cycle Context
`commitCycle()` currently stages all non-denied modified tracked files with no awareness of which files the active cycle actually touched. Pre-existing working-tree drift leaks into cycle commits. This cycle adds `parseTouchedFiles(buildMdPath)` and `scopeGuard(repoRoot, cycleId, envExtra)` to `src/engine/commit-cycle.ts`, wires the guard into `commitCycle()` before `stageFiles()`, extends `CommitResult` with a `scope_violation` variant carrying `blockedFiles: string[]`, and updates the build prompt to require a `## Touched Files` YAML list in BUILD.md.

## Current Codebase State

### Relevant Components

- **`CommitResult` type**: `src/engine/commit-cycle.ts:8–11` — discriminated union with three variants today: `{status:"ok"; sha:string}`, `{status:"skipped"; reason:"nothing_to_commit"}`, `{status:"failed"; reason:"commit_failed"|"push_failed"; attempt?:number}`. A fourth `{status:"failed"; reason:"scope_violation"; blockedFiles:string[]}` variant must be added.

- **`commitCycle()` function**: `src/engine/commit-cycle.ts:117–155` — entry point called by `cli.ts`. Accepts `{repoRoot, opts: {cycleId, title, issueId?, config, baseBranch, envExtra?}}`. First call at line 129 is `stageFiles(repoRoot, envExtra)`. The scope guard must run before this line.

- **`stageFiles()`**: `src/engine/commit-cycle.ts:36–79` — runs `git status --porcelain --untracked-files=all` (line 53), iterates entries, skips denied paths and gitlinks, then calls `git add`. The guard must run before this function is called — blocked files must never reach `git add`.

- **`spawnGit()` helper**: `src/engine/commit-cycle.ts:26–34` — wraps `spawnSync("git", args, {cwd, shell:false, env})` with `buildChildEnv(envExtra)`. The new `scopeGuard` will use this same pattern for `git status --porcelain`.

- **`DENYLIST_PREFIXES` / `DENYLIST_EXACT`**: `src/engine/commit-cycle.ts:13–14` — `.claude`, `dist`, `node_modules`, `.cycle/cycle.pid`, `*.lock`. The scope guard does not replace the denylist; it runs in addition to it. Files already on the denylist never reach the commit and need not appear in `## Touched Files`.

- **`buildChildEnv`**: `src/engine/child-env.ts` — imported at line 5. All subprocess invocations use this for PATH injection. `scopeGuard` must use it too to stay hermetic.

- **`cli.ts` resume path**: `src/cli.ts:248–254` — calls `commitCycle(cwd, {cycleId: tail.cycleId, title, issueId, config, baseBranch})`. No `envExtra` passed (production path). `tail.cycleId` is the string cycle ID (e.g. `"0114"`).

- **`cli.ts` main drain loop**: `src/cli.ts:355–361` — second call to `commitCycle`, same shape. Both call sites use `cycleId` as a plain string, which the new `scopeGuard` needs to locate `docs/cycle/${cycleId}-*/BUILD.md`.

- **`CommitConfig` type**: `src/engine/workflow.ts:13–16` — `{mode: "trunk"|"local-only"|"worktree-pr"; push: boolean}`. Not modified by this cycle.

- **Build prompt**: `src/defaults/prompts/build.md` and `.cycle/prompts/build.md` (synced copy). Currently outputs a free-text paragraph to stdout; no `## Touched Files` section instructed. The `.cycle/` copy is the active one; `src/defaults/` is the canonical source (run `npm run sync-defaults` after editing).

- **BUILD.md artifact directory**: Created by `prepareTrunkArtifactDir` at path `docs/cycle/<cycleId>-<workflow>-<slug>/`. The glob pattern `docs/cycle/${cycleId}-*/BUILD.md` uniquely resolves to one file per cycle ID.

- **ENGINE.md commit lifecycle section**: `docs/ENGINE.md:90–114` — documents the staging denylist, closes block, and commit failure handling. A new subsection for the scope guard belongs here.

- **Coverage gate**: `scripts/coverage-gate.mjs:12–15` — `FLOORS` table enforces per-file line coverage minimums. `commit-cycle.ts` is NOT in `FLOORS` yet; its current coverage is 99.35% (from cycle 0112 BUILD.md). SPEC requires it does not regress below 95%.

### Existing Patterns to Follow

- **`git status --porcelain` parsing**: `stageFiles()` at `src/engine/commit-cycle.ts:53–75` — iterates lines, slices `xy = raw.slice(0,2)` and `p = raw.slice(3)`, handles `R`/`C` rename arrow, strips quotes. The scope guard needs its own `git status --porcelain` call (without `--untracked-files=all` — only tracked-file drift matters for the guard) and similar line parsing to extract dirty file paths.

- **`node:fs/promises` for async file I/O**: `readFile` already imported at `src/engine/commit-cycle.ts:3`. `parseTouchedFiles` will use `readFile` to read BUILD.md, wrapped in try/catch returning `null` on ENOENT.

- **`glob` for artifact directory resolution**: Node 22 (`node:fs/promises`) exports `glob`. Alternatively, a `spawnSync("find", ...)` or `spawnSync("sh", ["-c", "ls ..."])` could find the path, but the codebase forbids `shell:true`. The `glob` from `node:fs/promises` (available since Node 22.0) is the idiomatic path; it's not currently imported in `commit-cycle.ts` but is available.

- **`null` as no-op sentinel**: `buildClosesBlock()` returns `""` on failure as a no-op. `parseTouchedFiles` returns `null` when BUILD.md absent or section missing — same sentinel-for-no-op idiom.

- **`envExtra` threading**: All functions in `commit-cycle.ts` accept `envExtra?: Record<string,string>` and pass it to `buildChildEnv`. `scopeGuard` must follow the same signature for hermetic test injection.

- **Test helper pattern**: `tests/engine/commit-cycle.test.ts:39–46` — `writeFakeBin(binDir, name, script)` writes a shell shim, `fakeEnv(binDir)` returns `{PATH: binDir + ":" + process.env.PATH}` — used to intercept `git`/`gh` calls. All new tests should use this same pattern.

- **Temp repo setup**: `setupRepo()` at `tests/engine/commit-cycle.test.ts:28–37` — `mkdtemp` + `git init --initial-branch=master` + initial commit. Regression test needs a temp repo with a `docs/cycle/<cycleId>-*/BUILD.md` file and a dirty `README.md`.

### Dependencies & Integration Points

- **`commitCycle()` ← `cli.ts`** (two call sites): The new `scope_violation` return from `commitCycle` must be handled at both call sites in `cli.ts`. Based on SPEC, `scope_violation` is a `failed` status with `reason:"scope_violation"` — the existing `cr.status === "failed"` branch in `cli.ts:255` and `cli.ts:362` already catches all `failed` variants, so no cli.ts changes are needed as long as `scope_violation` is a `failed` sub-variant.

- **`run-cycle.ts`**: Does not call `commitCycle` directly. No changes needed.

- **`npm run sync-defaults`**: Must be run after editing `src/defaults/prompts/build.md` to propagate to `.cycle/prompts/build.md`. Documented in `CLAUDE.md` commands table.

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`), no transpile. Tests run with `--experimental-strip-types`.
- **Test file location**: `tests/engine/commit-cycle.test.ts` — new tests for `parseTouchedFiles` and `scopeGuard` go here alongside existing tests.
- **Import pattern**: `import { commitCycle, buildClosesBlock } from "../../src/engine/commit-cycle.ts"` — new exported functions must be added to the same import line.
- **Coverage of change area**: `commit-cycle.ts` currently at 99.35% line coverage (cycle 0112 BUILD.md). Must not fall below 95%.
- **Coverage gate script**: `scripts/coverage-gate.mjs` — `commit-cycle.ts` has no floor entry; planner may add one at 95% to enforce the SPEC requirement.
- **Test count**: 13 tests currently in `commit-cycle.test.ts` (10 original + 3 added in cycle 0112 fix).

## Code References

- `src/engine/commit-cycle.ts:8–11` — `CommitResult` discriminated union (add `scope_violation` variant)
- `src/engine/commit-cycle.ts:13–14` — `DENYLIST_PREFIXES` / `DENYLIST_EXACT`
- `src/engine/commit-cycle.ts:26–34` — `spawnGit()` helper (pattern for `scopeGuard`'s git call)
- `src/engine/commit-cycle.ts:36–79` — `stageFiles()` (guard must run before this)
- `src/engine/commit-cycle.ts:117–130` — `commitCycle()` preamble; guard inserted before line 129
- `src/engine/commit-cycle.ts:144` — push gate `if (!opts.config.push || opts.config.mode === "local-only")`
- `src/engine/child-env.ts` — `buildChildEnv` (must be used in `scopeGuard`)
- `src/engine/workflow.ts:13–16` — `CommitConfig` type
- `src/cli.ts:248–254` — resume-path `commitCycle` call (handles `cr.status === "failed"`)
- `src/cli.ts:355–362` — main-drain `commitCycle` call (same failure handling)
- `src/defaults/prompts/build.md:68–81` — stdout output instructions (add `## Touched Files` requirement here)
- `.cycle/prompts/build.md` — synced copy; updated by `npm run sync-defaults`
- `docs/ENGINE.md:90–114` — "Engine-managed commit lifecycle" section (add scope guard subsection)
- `scripts/coverage-gate.mjs:12–15` — `FLOORS` table (optionally add `commit-cycle.ts: 95`)
- `tests/engine/commit-cycle.test.ts:28–46` — `setupRepo`, `writeFakeBin`, `fakeEnv` helpers

## Open Questions

1. **`glob` import for BUILD.md resolution**: `node:fs/promises` exports `glob` in Node 22 but it is not currently imported in `commit-cycle.ts`. Alternative: use `spawnSync` with `find` (disallowed with `shell:true`) or a manual `readdir` + filter. Planner should decide: `import { glob } from "node:fs/promises"` vs. `import { readdir } from "node:fs/promises"` + manual prefix match.

2. **Scope guard vs. denylist interaction**: Should the guard apply `isDenied()` filtering before checking the touched-files list (i.e., denied files are exempt from the scope check)? The SPEC doesn't specify, but the denylist prevents these files from ever being staged anyway, so requiring them in `## Touched Files` would be surprising. Planner should clarify.

3. **`git status --porcelain` flags for the guard**: `stageFiles` uses `--untracked-files=all`. The guard should check only tracked dirty files (modified/deleted/renamed tracked files) — not new untracked files — because `stageFiles` won't add untracked files that don't already appear in the index. Planner should confirm the exact porcelain flags.

4. **`scope_violation` failure handling in `cli.ts`**: The existing `cr.status === "failed"` branch covers all `failed` sub-variants. If SPEC intends `scope_violation` to be logged distinctly (e.g. a specific log event), a `cli.ts` change may be needed. Planner should confirm whether an additional log event is required.
```
