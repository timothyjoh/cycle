I have enough to write the research document now.

```markdown
# Research: Cycle 0188

## Cycle Context

Cycle 0188 adds a post-documentation-step hook in `run-cycle.ts` that reads `git status --porcelain`, diffs the returned paths against the `## Touched Files` section of `BUILD.md`, and appends any missing paths as `- <path>` bullets. This eliminates the recurring `scopeGuard` commit failures where `README.md` and `docs/ARCHITECTURE.md` are modified by the documentation step but were never declared in BUILD.md (which is authored during the build step before documentation runs).

## Current Codebase State

### Relevant Components

- **Step execution loop**: `src/engine/run-cycle.ts:147–290` — iterates `wf.steps`, runs each step, applies per-step post-condition guards inline. `artifactDir` is in scope throughout.
- **Documentation failure handler**: `src/engine/run-cycle.ts:282–286` — if `step.name === "documentation"` and `r.status === "failed"`, emits `documentation.skipped` and `continue`s. No `ok`-path handling exists beyond writing `DOCUMENTATION.md`.
- **Artifact write seam**: `src/engine/run-cycle.ts:229–267` — single block `if (r.status === "ok" && step.name)` writes `<artifactDir>/<STEP>.md`; subsequent guards (`spec`, `fix`, `empty-diff`) and `ingestReflection` are chained here.
- **`parseTouchedFiles`**: `src/engine/commit-cycle.ts:27–45` — exported; reads BUILD.md, finds `## Touched Files` header, returns `string[] | null` (null = file absent or section missing). Bullet regex: `/^\s*-\s+(.+)/`.
- **`scopeGuard`**: `src/engine/commit-cycle.ts:47–80` — runs `git status --porcelain` via `spawnGit`, collects dirty paths not in the touched set, skips `??` untracked and denylist-exempt entries, returns blocked file list.
- **`spawnSync` usage in run-cycle.ts**: `src/engine/run-cycle.ts:24` — already imported from `node:child_process`; used for the empty-diff guard at lines 253–263.
- **`writeFile` / `readFile`**: `src/engine/run-cycle.ts:21` — already imported from `node:fs/promises`.
- **`readdir`**: imported in `src/engine/commit-cycle.ts:3` but NOT in `run-cycle.ts` — not needed for this cycle since `artifactDir` is already resolved.
- **BUILD.md path from run-cycle.ts**: `join(artifactDir, "BUILD.md")` — `artifactDir` is in scope, eliminates need for a `readdir` prefix scan.

### Existing Patterns to Follow

- **Inline step-name guard pattern**: `src/engine/run-cycle.ts:232–267` — `if (r.status === "ok" && step.name === "spec") { ... }`, `if (r.status === "ok" && step.name === "reflection") { ... }`. The documentation append follows the same shape: `if (r.status === "ok" && step.name === "documentation") { ... }`.
- **`spawnSync` for git**: `src/engine/run-cycle.ts:253–257` — `spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", shell: false })`. Same call shape needed for the append.
- **Bullet format**: `- <path>\n` — matches what `parseTouchedFiles` regex `/^\s*-\s+(.+)/` expects.
- **Silent skip on absent/no-section BUILD.md**: `parseTouchedFiles` returns `null` when file is absent or section is missing — the append block must guard on `null` and return early with no error.
- **Idempotency via set membership**: build a `Set` from `parseTouchedFiles` result, skip paths already present — identical to how `scopeGuard` uses `touchedSet` at `commit-cycle.ts:63`.
- **`??` skip for untracked**: `scopeGuard` at `commit-cycle.ts:68` skips `xy === "??"`; the append helper must do the same so untracked files aren't spuriously added.
- **Denylist skip**: `scopeGuard` calls `isDenied(p)` to skip `.claude/`, `dist/`, `node_modules/`, `*.lock`. The append should apply the same filter to avoid polluting Touched Files with denied paths.

### Dependencies & Integration Points

- **`parseTouchedFiles` import**: must be added to the import from `./commit-cycle.ts` in `run-cycle.ts` — currently only `src/engine/commit-cycle.ts` imports it (`commit-cycle.test.ts:7`).
- **`isDenied`**: defined at `src/engine/commit-cycle.ts:17–25` but NOT exported. The append either re-implements the same three-rule check inline or `isDenied` must be exported. Both are viable; re-implementing is simpler (3 prefix checks + 1 exact + 1 `.lock` suffix).
- **`buildChildEnv`**: used in `commit-cycle.ts` for git calls; the `spawnSync` calls in `run-cycle.ts:253` do NOT use `buildChildEnv` — they pass no `env` override. The append can follow the same simpler pattern.
- **`writeFile`**: used in `run-cycle.ts:231` — already available for appending to BUILD.md.

### Test Infrastructure

- **Framework**: Node.js built-in `node:test` + `node:assert/strict` — no Vitest despite SPEC naming it. All engine tests use `node:test`.
- **Test file for documentation step**: `tests/engine/run-cycle.documentation.test.ts` — 4 existing tests covering success/failure in standard and `no_branch` workflow modes.
- **Test helpers in that file**: `workflowYml(stepsBody)` (trunk mode), `workflowYmlNoBranch(stepsBody)`, `parseLog()`, `fileExists()`, `setupGitRepo()`, `git()`.
- **Fake claude binary pattern**: writes a `#!/bin/bash` script to a tmpdir, passes `PATH: <bin>:<process.env.PATH>` in `env`; the fake's stdout becomes step output.
- **`expectExactlyOne`**: `tests/helpers.ts:3` — asserts `length === 1`, returns matched event.
- **Isolation**: each test creates its own `mkdtemp` root and bin dir, cleans up in `finally`.
- **Working tree mutations in tests**: to simulate documentation step modifying files, the fake `claude` binary can write files to the repo root before exiting 0 — those will show in `git status --porcelain`.

## Code References

- `src/engine/run-cycle.ts:21` — `import { writeFile, readFile, stat } from "node:fs/promises"` — needs `readFile` for BUILD.md append (already present)
- `src/engine/run-cycle.ts:24` — `import { spawnSync } from "node:child_process"` — already present
- `src/engine/run-cycle.ts:229` — artifact-write `if (r.status === "ok" && step.name)` block — append logic slots in here after artifact write
- `src/engine/run-cycle.ts:265` — `if (r.status === "ok" && step.name === "reflection")` — parallel pattern for documentation
- `src/engine/run-cycle.ts:282–286` — documentation failure handler (`documentation.skipped` + `continue`)
- `src/engine/commit-cycle.ts:14–25` — `isDenied` (not exported); `DENYLIST_PREFIXES`, `DENYLIST_EXACT`
- `src/engine/commit-cycle.ts:27–45` — `parseTouchedFiles` (exported)
- `src/engine/commit-cycle.ts:64–78` — `scopeGuard` porcelain parsing and set-membership check — the pattern to replicate in the append helper
- `tests/engine/run-cycle.documentation.test.ts:1–241` — all 4 existing documentation-step tests
- `docs/ENGINE.md:70–73` — "Documentation step" section — needs one added sentence about the auto-append

## Open Questions

- **`isDenied` export vs. inline**: Should `isDenied` be exported from `commit-cycle.ts` for reuse in run-cycle.ts, or should the append inline the same three-rule check? Exporting creates a dependency between two modules that previously had none; inlining duplicates 8 lines. Planner to decide.
- **Placement within the artifact-write block**: The append could go (a) inside the `if (r.status === "ok" && step.name)` block (after the artifact write, before `step.end`) or (b) as a separate `if (r.status === "ok" && step.name === "documentation")` block after the main artifact-write block — same as the `reflection` ingest pattern. Both are consistent with existing code; (b) is more parallel to `ingestReflection`.
- **Append failure handling**: If the `readFile`/`writeFile` for BUILD.md fails (e.g., permission error), should the error be swallowed silently (matching the BUILD.md-absent no-op contract) or surfaced as a `step.warning`? SPEC says "skipped silently" for missing/no-section; it does not explicitly address write failure.
- **`??` untracked path handling**: SPEC says to read `git status --porcelain` and append modified paths. Untracked files (`??` prefix) should likely be excluded (consistent with `scopeGuard`), but SPEC does not state this explicitly.
```
