---

# Research: Cycle 0112

## Cycle Context

Cycle 0112 extracts commit, push, and PR creation from workflow step definitions and makes them engine-managed behavior. Currently every workflow embeds explicit `commit` and `pr` bash steps (`scripts/commit.sh`, `scripts/commit-trunk.sh`, `scripts/pr.sh`) that run like any other step — the engine has no awareness of commit lifecycle, retries, or push failures. This cycle delivers: a `CommitConfig` type + `engine.commit` block parsed from `workflows.yml`, a `commitCycle()` engine function implementing `trunk` and `local-only` modes with push retry (3× backoff), closes-block generation from `CYCLE_ISSUE_ID` + `gh repo view`, migration of both `workflows.yml` files (remove `commit`/`pr` steps), deletion of four obsolete scripts, and removal of the `no_branch` field from the workflow schema. Worktree-based modes (`worktree-pr`, `review-pr`) are out of scope.

---

## Current Codebase State

### Relevant Components

- **Config loader / type definitions**: `src/engine/workflow.ts` — defines `Step`, `Workflow` (with `no_branch?: boolean`), `EngineConfig`, `TriageConfig`, `CycleConfig`. `loadConfig()` reads `.cycle/workflows.yml`, validates top-level structure, and returns a `CycleConfig`. `loadWorkflow()` calls `loadConfig()` then finds by name. **No `CommitConfig` type exists yet.**

- **Cycle runner**: `src/engine/run-cycle.ts` — `runCycle()` iterates `wf.steps[]` and dispatches to `execBashStep` or agent `runStep`. Steps complete → emits `cycle.end {status: "ok"}` and returns `{ cycleId, status: "ok" }`. The `finally` block handles checkout-back-to-base (skipped for `no_branch` workflows) and `pullBase`. **No commit or push logic exists here.** `commitCycle()` does not exist.

- **CLI dispatch loop**: `src/cli.ts:405–412` — calls `runCycle()`, checks `r.status === "ok"`, calls `drainSuccess()`. This is the primary call site where `commitCycle()` must be inserted between the `runCycle` return and the `drainSuccess` call. Resume path at `src/cli.ts:311–323` is the secondary call site.

- **Branch utilities**: `src/engine/branch.ts` — all git ops use `spawn` with array args, no shell. Exports: `createCycleBranch`, `checkoutCycleBranch`, `checkoutBase`, `prepareTrunkArtifactDir`, `pullBase`, `currentBranchName`, `revParseHead`, `resetCycleBranchTo`, `shaExists`. New git ops for `commitCycle()` should follow this same pattern.

- **Bash step executor**: `src/engine/exec-bash.ts` — `execBashStep()` spawns `/bin/bash [abs]` with `buildChildEnv(env)`, no shell. Returns `StepResult { status, exitCode, stdout, stderr }`.

- **Child env builder**: `src/engine/child-env.ts:16` — `buildChildEnv(extra)` prepends parent node's bin dir to PATH. All subprocesses should use this.

- **Existing commit script (branch workflows)**: `src/defaults/scripts/commit.sh` — bash script that selectively stages files (denylist: `.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`, gitlinks), sources `lib/closes.sh`, calls `gh repo view` for repo slug, commits with `cycle ${CYCLE_ID}: ${CYCLE_TITLE}` + optional `Closes #N` footer. Does **not** push.

- **Existing commit script (trunk)**: `src/defaults/scripts/commit-trunk.sh` — identical staging logic to `commit.sh`, plus `git push origin <branch>` at end.

- **Existing PR script**: `src/defaults/scripts/pr.sh` — pushes branch, creates PR via `gh pr create`, enables auto-merge, polls until merged. Falls back to synchronous squash merge if auto-merge disabled. Restart-tolerant (detects existing PR).

- **Closes helper**: `src/defaults/scripts/lib/closes.sh` — `closes_block()` function; reads issue file, extracts `https://github.com/<owner>/<repo>/issues/<N>` URLs matching current repo slug, emits `Closes #N` lines.

- **`no_branch` field**: Present in `Workflow` type at `src/engine/workflow.ts:17`. Checked in `run-cycle.ts` at lines 110, 117, 156, 239. The `e2e-tests`, `document`, and `quickfix` workflows in `.cycle/workflows.yml` set `no_branch: true`. The `feature` workflow in `.cycle/workflows.yml` also sets `no_branch: true`. The `src/defaults/workflows.yml` feature and quickfix workflows do **not** set `no_branch`.

- **`CYCLE_BASE` env var**: Set in `cycleEnv` at `run-cycle.ts:127` from `process.env.CYCLE_BASE ?? "main"`. Note: `.cycle/workflows.yml` has `engine.base_branch: master` but `run-cycle.ts` reads from `process.env.CYCLE_BASE`, not `cfg.engine.base_branch`. The two are not connected in current code.

### src/defaults/workflows.yml — current step sequences

| Workflow | Steps |
|---|---|
| `feature` | spec, research, plan, build, review, fix, verify, **commit**, **pr**, documentation |
| `quickfix` | plan_fix, quick_fix, test_fix, verify, **commit**, **pr** |
| `e2e-tests` (no_branch) | research, test_plan, test_build, review, fix, verify, **commit** (commit-trunk.sh) |

### .cycle/workflows.yml — current step sequences (diverged)

| Workflow | Steps | note |
|---|---|---|
| `feature` (no_branch) | spec, research, plan, build, review, fix, verify, **commit** (commit-trunk.sh) | no pr step |
| `document` (no_branch) | plan_documents, authoring, review_documents, verify, **commit** (commit-trunk.sh) | — |
| `quickfix` (no_branch) | plan_fix, quick_fix, test_fix, verify, **commit** (commit-trunk.sh) | no pr step |
| `e2e-tests` (no_branch) | research, test_plan, test_build, review, fix, verify, **commit** (commit-trunk.sh) | — |

### Existing Patterns to Follow

- **Subprocess pattern**: All git/gh ops in `branch.ts` use `spawn("git", [...], { cwd, shell: false })`. New `commitCycle()` must follow this exact pattern — no `exec`, no `shell: true`.

- **StepResult return shape**: `{ status: "ok"|"failed", exitCode: number, stdout: string, stderr: string }` — defined in `exec-bash.ts:5-9`. A commit result type may mirror this.

- **Logger pattern**: `log.emit(event, payload)` is async, used throughout `run-cycle.ts` and `cli.ts`. New commit events should follow the same pattern.

- **Config validation pattern**: `loadConfig()` in `workflow.ts:48–65` manually validates each required section and throws with a descriptive message. The new `engine.commit` block should be parsed and validated in the same function with the same throw-on-unknown-mode approach.

- **Async git wrapper**: `branch.ts:5–15` defines a local `git()` helper returning `Promise<void>` that rejects on non-zero exit. New git operations can follow this or add stdout-capturing variants (see `revParse()` at `branch.ts:64–71`).

- **Test pattern**: All engine tests use Node's built-in `node:test` + `node:assert`. Each test creates a `mkdtemp` temp dir, initializes a bare git repo with `spawnSync`, writes `.cycle/workflows.yml`, calls the module under test, then cleans up in `finally`. No external test doubles — fake CLIs written as executable bash scripts.

- **`workflowYml()` helper**: `tests/engine/run-cycle.test.ts:15–28` — shared helper that emits a full valid `workflows.yml` with customizable steps body. New `commitCycle()` tests should use the same mkdtemp + git-init pattern.

### Dependencies & Integration Points

- **`loadConfig()` → `EngineConfig`** (`src/engine/workflow.ts:39`): Must be extended to parse `engine.commit` and attach a `CommitConfig` to the returned `CycleConfig`. All callers of `loadConfig()` go through `cli.ts:88`.

- **`runCycle()` return** (`src/engine/run-cycle.ts:234–235`): Returns `{ cycleId, status: "ok" }` on success. `commitCycle()` must be called by the **caller** (`cli.ts`) after a successful `runCycle` return, not inside `runCycle` itself — the SPEC says commit is "not a step".

- **Two `runCycle` call sites in `cli.ts`**:
  1. Main drain loop: `cli.ts:405` — `r = await runCycle(...)` → `r.status === "ok"` → `drainSuccess()`
  2. Resume path: `cli.ts:311` — `rr = await runCycle(...)` → `rr.status === "ok"` → `drainSuccess()`
  Both need `commitCycle()` inserted before `drainSuccess()`.

- **`CycleConfig` passed to `runResumeOnce`** (`cli.ts:228`): `cfg` is already available at both call sites, so `commitCycle()` can receive `cfg.engine.commit` without additional loading.

- **`CYCLE_ISSUE_ID` env**: Set in `cycleEnv` at `run-cycle.ts:129` when `opts.issueId` is non-empty. The commit function needs this to generate the closes block — it must be passed as a parameter or accessed from the opts/env.

- **`gh` CLI**: Already required at runtime per `BRIEF.md`. Used in `commit.sh` and `pr.sh` via subshell. New TypeScript implementation must use `spawn("gh", [...], { shell: false })`.

### Test Infrastructure

- **Framework**: Node.js built-in `node:test` + `node:assert/strict`. No Jest, no Vitest label — but `npm test` runs via `vitest` config (`package.json`). Tests run with `--experimental-strip-types` (Node ≥ 22.6).

- **Test conventions**: Each test file covers one module. Engine tests live in `tests/engine/`. Defaults tests live in `tests/defaults/`. Temp dirs via `mkdtemp(join(tmpdir(), "cycle-<slug>-"))`. Cleanup in `finally { rm(root, { recursive: true }) }`.

- **Mocking approach**: No mock libraries. Fake executables written as bash scripts to temp `bin/` dirs prepended to PATH (see `run-cycle.test.ts:55–57`). This is how `commitCycle()` tests should mock `git` and `gh`.

- **Coverage of change area**:
  - `src/engine/workflow.ts`: covered by `tests/engine/workflow.test.ts` (9 tests covering parse, validation errors, unknown workflow).
  - `src/engine/run-cycle.ts`: covered by 8 test files (`run-cycle.test.ts`, `run-cycle.reflection.test.ts`, `run-cycle.documentation.test.ts`, etc.). No test currently exercises commit/push behavior (those are in bash tests).
  - `src/engine/branch.ts`: covered by `tests/engine/branch.test.ts`.
  - `src/defaults/scripts/commit.sh`: covered by `tests/defaults/commit_sh.test.ts` and `tests/defaults/commit-staging.test.ts` (these will be affected by script deletion).
  - `src/defaults/scripts/pr.sh`: covered by `tests/defaults/pr-auto-merge-fallback.test.ts` and `tests/defaults/pr-restart-tolerance.test.ts` (these will be affected by script deletion).
  - `src/defaults/scripts/lib/closes.sh`: covered by `tests/defaults/closes-linkage.test.ts`.

- **Workflow step-order regression tests**: `tests/defaults/feature-yaml.test.ts` asserts `src/defaults/workflows.yml` feature step sequence matches exact array including `commit` and `pr`. `tests/defaults/quickfix-yaml.test.ts` asserts both `src/defaults` and `.cycle` quickfix step sequences. **Both must be updated** when steps are removed.

---

## Code References

- `src/engine/workflow.ts:17` — `no_branch?: boolean` field on `Workflow` type (to be removed)
- `src/engine/workflow.ts:20–25` — `EngineConfig` type (needs `commit?: CommitConfig` added)
- `src/engine/workflow.ts:33–36` — `CycleConfig` type (needs `CommitConfig` surfaced)
- `src/engine/workflow.ts:39–65` — `loadConfig()` — validation and parse entry point
- `src/engine/run-cycle.ts:95` — `runCycle()` signature
- `src/engine/run-cycle.ts:110–122` — `no_branch` branch dispatch (both resume and fresh)
- `src/engine/run-cycle.ts:124–130` — `cycleEnv` construction including `CYCLE_ISSUE_ID`
- `src/engine/run-cycle.ts:156` — `no_branch` guard on reset-eligible steps
- `src/engine/run-cycle.ts:234–235` — success return (before this, steps are done)
- `src/engine/run-cycle.ts:239–242` — `no_branch` guard in finally block
- `src/engine/branch.ts:5–15` — `git()` helper (spawn pattern to follow)
- `src/engine/branch.ts:64–71` — `revParse()` (stdout-capturing spawn variant)
- `src/engine/child-env.ts:16` — `buildChildEnv()` (must be used by `commitCycle()`)
- `src/cli.ts:88` — `loadConfig()` call (config available to both call sites)
- `src/cli.ts:311–323` — resume path: `runCycle` → success → `drainSuccess` (insert commit here)
- `src/cli.ts:405–415` — main drain loop: `runCycle` → success → `drainSuccess` (insert commit here)
- `src/defaults/scripts/commit.sh` — staging logic and closes-block generation to port to TypeScript
- `src/defaults/scripts/commit-trunk.sh` — adds `git push origin <branch>` after commit
- `src/defaults/scripts/pr.sh` — full PR create + merge flow (out of scope for this cycle)
- `src/defaults/scripts/lib/closes.sh` — closes-block extraction logic to port to TypeScript
- `src/defaults/workflows.yml:22–23` — `commit` + `pr` steps in feature (to be removed)
- `src/defaults/workflows.yml:33–34` — `commit` + `pr` steps in quickfix (to be removed)
- `src/defaults/workflows.yml:48` — `commit` step in e2e-tests (to be removed)
- `.cycle/workflows.yml:28` — `commit` step in feature (to be removed)
- `.cycle/workflows.yml:42` — `commit` step in document (to be removed)
- `.cycle/workflows.yml:53` — `commit` step in quickfix (to be removed)
- `.cycle/workflows.yml:66` — `commit` step in e2e-tests (to be removed)
- `tests/defaults/feature-yaml.test.ts:11` — step array assertion including `commit`, `pr` (must update)
- `tests/defaults/quickfix-yaml.test.ts:12,23` — step array assertions (must update)
- `tests/defaults/commit_sh.test.ts` — tests against `commit.sh` (will be deleted with script)
- `tests/defaults/commit-staging.test.ts` — tests against `commit.sh` staging logic (will be deleted)
- `tests/defaults/closes-linkage.test.ts` — tests against `lib/closes.sh` (will be deleted)
- `tests/defaults/pr-auto-merge-fallback.test.ts` — tests against `pr.sh` (will be deleted)
- `tests/defaults/pr-restart-tolerance.test.ts` — tests against `pr.sh` (will be deleted)

---

## Open Questions

1. **`CYCLE_BASE` source**: `run-cycle.ts:127` reads `process.env.CYCLE_BASE ?? "main"` rather than `cfg.engine.base_branch`. Should `commitCycle()` use `cfg.engine.base_branch` (which is `master` in `.cycle/workflows.yml`) or continue reading from the env var? The two can diverge.

2. **File staging logic location**: The selective-staging logic (denylist + gitlink detection) in `commit.sh` is ~40 lines of bash. Should it be ported into `commitCycle()` directly (TypeScript using `spawnSync("git", ["status", "--porcelain", ...])`) or extracted into a shared helper (e.g., `src/engine/stage.ts`)?

3. **Deleted test files**: Five test files in `tests/defaults/` test the bash scripts being deleted (`commit_sh.test.ts`, `commit-staging.test.ts`, `closes-linkage.test.ts`, `pr-auto-merge-fallback.test.ts`, `pr-restart-tolerance.test.ts`). The planner must decide whether to delete them outright or replace them with TypeScript equivalents testing `commitCycle()`.

4. **`no_branch` removal scope**: `no_branch` is checked in 4 places in `run-cycle.ts` (lines 110, 117, 156, 239) and present in `.cycle/workflows.yml` for all four workflows. After removal, the `trunk` commit mode owns the "stay on base branch" behavior — but `run-cycle.ts` still needs to know whether to `createCycleBranch` vs `prepareTrunkArtifactDir`. What replaces the `no_branch` gate for branch creation? Is `engine.commit.mode === "trunk"` the new signal, or does the workflow get a different field?

5. **`document` workflow in `.cycle/workflows.yml`**: Not present in `src/defaults/workflows.yml`. The planner must decide whether to add it to defaults or treat it as a local-only workflow, and how its `commit` step removal is handled.

6. **PR script fate**: `pr.sh` is deleted per SPEC. Its test files (`pr-auto-merge-fallback.test.ts`, `pr-restart-tolerance.test.ts`) cover restart-tolerance and auto-merge fallback logic. If these behaviors are needed in the TypeScript `commitCycle()` for trunk mode, the tests need porting; if not (trunk just pushes directly), the tests can be deleted.
