Enough data collected. Writing the research document now.

```markdown
# Research: Cycle 0078

## Cycle Context

The `feature` workflow (both `src/defaults/workflows.yml` and `.cycle/workflows.yml`) runs `commit` before `reflection`. Because `reflection` writes `REFLECTION.md` and `refl-<cycleId>-*.md` raw files to disk only after the cycle's own commit, those files are left untracked until the next cycle's `commit` (or `commit-trunk.sh`) greedily stages everything via `git status --porcelain`, attributing them to the wrong cycle. The fix must ensure reflection artifacts are committed under the cycle that produced them. Two viable options: (a) reorder `reflection` before `commit` in both workflow files, or (b) add a narrow `commit_reflection` bash step after `reflection` that stages only that cycle's reflection artifacts.

## Current Codebase State

### Relevant Components

- **Default feature workflow (branch+PR)**: `src/defaults/workflows.yml:14-25`  
  Steps (in order): spec, research, plan, build, review, fix, verify, **commit** (line 22), **pr** (line 23), **reflection** (line 24), documentation.

- **Dogfood feature workflow (trunk-based)**: `.cycle/workflows.yml:17-30`  
  Steps: spec, research, plan, build, review, fix, verify, **commit** (commit-trunk.sh, line 29), **reflection** (line 30). No `pr`, no `documentation`. Carries `no_branch: true` (line 20).

- **commit-trunk.sh** (dogfood commit script): `src/defaults/scripts/commit-trunk.sh`  
  Stages via `git status --porcelain --untracked-files=all` (line 60). Denylist: `.claude`, `dist`, `node_modules`, `.cycle/cycle.pid`, `*.lock` (lines 11-22). No exclusion for `docs/cycle/` or `docs/cycle/issues/raw/`. Commits as `cycle ${CYCLE_ID}: ${CYCLE_TITLE}` (lines 79-82). Receives `CYCLE_ID` and `CYCLE_TITLE` from environment (lines 8-9).

- **commit.sh** (branch-based commit script): `src/defaults/scripts/commit.sh`  
  Identical staging logic and denylist to `commit-trunk.sh` (lines 11-66). Same `git status --porcelain --untracked-files=all` greedy walk. No exclusion for reflection artifacts.

- **Reflection ingestion**: `src/engine/reflection.ts:14` — `ingestReflection(repoRoot, cycleId, _cycleSlug, stdout, log)`  
  Writes `refl-<cycleId>-<slug>.md` files to `docs/cycle/issues/raw/` (lines 21-22, 110). On parse failure, writes `refl-<cycleId>-parse-error.md` to the same directory (reflection.ts:201-218).

- **REFLECTION.md artifact write**: `src/engine/run-cycle.ts:196-197`  
  Written for any non-bash step via the generic artifact path: `join(artifactDir, "REFLECTION.md")`. `artifactDir` = `docs/cycle/<cycleId>-<workflow>-<slug>/` (branch.ts:36, 59-60).

- **Non-fatal step handling**: `src/engine/run-cycle.ts:221-228`  
  `reflection` step failure → emits `reflection.skipped {reason: "exec_failed"}`, `continue`s the loop (lines 221-224). `documentation` same pattern (225-228). Neither flips `cycle.end` to failed. The non-fatal set is hard-coded (not configurable in YAML).

- **Env vars available to bash steps**: `src/engine/run-cycle.ts:124-130`  
  `CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_BASE`, `CYCLE_ISSUE_ID` — all injected into `cycleEnv`, passed to `execBashStep` at line 182. A `commit-reflection.sh` bash step can use `CYCLE_ID` without engine changes.

- **`skip_unless` field**: `src/engine/workflow.ts:10`  
  Defined in the `Step` type but **not implemented in `run-cycle.ts` or `cli.ts`**. Only exists as a YAML documentation marker and a hint surfaced in the `fix.md` prompt. A new `commit_reflection` step cannot rely on `skip_unless` to auto-skip when no REFLECTION.md exists — the script itself must handle that case.

### Existing Patterns to Follow

- **Bash step non-fatal exit 0 on nothing-to-commit**: `src/defaults/scripts/commit-trunk.sh:62-65` — if `git diff --cached --quiet`, print message and `exit 0`. A `commit-reflection.sh` must do the same when reflection was skipped and no files exist to stage.

- **Selective git add (no `git add -A`)**: `src/defaults/scripts/commit.sh:38-66`, `commit-trunk.sh:37-60` — iterate `git status --porcelain`, apply denylist, then `git add -- "$path"`. New `commit-reflection.sh` for option (b) will instead stage a specific explicit path list, not the porcelain walk.

- **Atomic tmp-rename writes**: `src/engine/reflection.ts:228-242` — pattern used throughout for file writes to `docs/cycle/issues/raw/`.

- **Non-fatal terminal step pattern**: `src/engine/run-cycle.ts:221-228` — check `step.name === "reflection"`, emit `reflection.skipped`, `continue`. Any new step that must also be non-fatal would need to be added to this block.

- **Step ordering test**: `tests/defaults/feature-yaml.test.ts:6-13` — asserts exact `feature` step name array. This test will require updating regardless of which option is chosen.

- **Commit script integration test**: `tests/defaults/commit-staging.test.ts` — pattern for option (b) test: `mkdtemp` git repo, copy script, write files, `spawnSync("bash", [script])`, assert `git diff-tree --name-only HEAD`.

### Dependencies & Integration Points

- **`src/defaults/workflows.yml` ↔ `.cycle/workflows.yml`**: Must be updated in tandem. `.cycle/workflows.yml` carries the `no_branch: true` trunk divergence (lines 11-16 comment) and drops the `pr` and `documentation` steps. After this fix, `.cycle/workflows.yml` must also drop `documentation` if option (a) moves reflection before it, or gain the new `commit_reflection` step if option (b).

- **`ingestReflection` called from `run-cycle.ts:208`**: Called only when `r.status === "ok"` and `step.name === "reflection"`. If reflection exec-fails, `ingestReflection` is never called, so `raw/refl-<cycleId>-*.md` files are never written in that case. `REFLECTION.md` is also never written (the `writeFile` at line 196-197 is inside `if (r.status === "ok")`).

- **`parseLogTail` / resume**: `src/engine/log-tail.ts` — `step.skipped` is treated as terminal-equivalent to `step.end status:"ok"` for resume index math (CLAUDE.md). Adding a new bash step must not break resume.

- **`SKIP_ELIGIBLE_STEPS`**: `src/engine/run-cycle.ts:29` — `{"spec", "research", "plan"}`. Bash steps bypass the skip gate entirely (line 143: `step.agent !== "bash"`). A new `commit_reflection` bash step is not subject to the skip-completed-on-retry logic.

- **`RESET_ELIGIBLE_STEPS`**: `src/engine/run-cycle.ts:23` — `{"build", "fix"}` only. A new `commit_reflection` step must NOT be added here.

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`) with `--experimental-strip-types` (no transpile). Tests live in `tests/`.
- **Defaults tests**: `tests/defaults/` — test workflow YAML shape, script behavior via `spawnSync`, and prompt content.
- **Engine tests**: `tests/engine/` — unit and integration tests for engine components.
- **Step order test**: `tests/defaults/feature-yaml.test.ts:11` — hardcodes exact step name array `["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr", "reflection", "documentation"]` with a count guard at line 12. Must be updated for option (a) (reorder) or option (b) (insert new step).
- **Commit script tests**: `tests/defaults/commit-staging.test.ts` — 5 integration tests using real git repos. Pattern: `makeRepo()` creates temp git repo, copies script, writes test files, runs `spawnSync("bash", [script], {env: {CYCLE_ID, CYCLE_TITLE}})`, asserts staged file list via `git diff-tree`.
- **Reflection run-cycle tests**: `tests/engine/run-cycle.reflection.test.ts` — 4 tests covering: successful ingestion, empty sharp_edges, exec-failed (non-fatal), parse error (non-fatal). All use fake `claude` binary and real git repos.
- **Coverage gates**: `src/engine/triage.ts` requires ≥ 95% line coverage. Other files: global line ≥ 95%, branch ≥ 75%, function ≥ 90%.

## Code References

- `src/defaults/workflows.yml:14-25` — feature workflow step list (branch+PR variant)
- `.cycle/workflows.yml:17-30` — dogfood feature workflow step list (trunk, no_branch)
- `src/defaults/scripts/commit-trunk.sh:37-65` — greedy porcelain staging loop + early-exit on empty
- `src/defaults/scripts/commit.sh:38-71` — identical staging logic for branch variant
- `src/engine/run-cycle.ts:124-130` — `cycleEnv` construction (CYCLE_ID, CYCLE_TITLE, CYCLE_BASE, CYCLE_ISSUE_ID)
- `src/engine/run-cycle.ts:182` — bash step receives `cycleEnv`
- `src/engine/run-cycle.ts:194-209` — artifact write seam + reflection ingestion call
- `src/engine/run-cycle.ts:221-228` — non-fatal continuation for reflection and documentation
- `src/engine/reflection.ts:14-127` — `ingestReflection`: writes `refl-<id>.md` to `raw/`
- `src/engine/workflow.ts:5-11` — `Step` type; `skip_unless` field defined but not engine-enforced
- `src/engine/branch.ts:58-61` — `prepareTrunkArtifactDir`: `artifactDir` = `docs/cycle/<id>-<workflow>-<slug>/`
- `tests/defaults/feature-yaml.test.ts:11` — step order assertion (will need update)
- `tests/defaults/commit-staging.test.ts:16-36` — `makeRepo()` helper pattern for script integration tests
- `tests/engine/run-cycle.reflection.test.ts:47-101` — reflection success integration test pattern

## Open Questions

- **Which option (a or b)?** The SPEC defers this to the plan step. Key trade-off: option (a) is 2 YAML edits + 1 test update (minimal surface); option (b) requires a new script, 2 YAML edits, a new test, and careful graceful-exit when reflection was skipped.
- **Does `documentation` step in `src/defaults/workflows.yml` need to move as well?** Currently documentation is after reflection (after commit). If option (a) moves only reflection before commit, documentation still lands after commit. The SPEC only mentions reflection artifacts — confirm whether documentation artifacts have the same scooping problem.
- **`.cycle/workflows.yml` has no `documentation` step** — dogfood is not affected by that question, only the shipped default.
- **`commit_reflection` skip behavior (option b)**: When reflection is exec-failed, `REFLECTION.md` doesn't exist and no `refl-<id>-*.md` files are written. The script must stage zero files and exit 0. Needs explicit test coverage.
```
