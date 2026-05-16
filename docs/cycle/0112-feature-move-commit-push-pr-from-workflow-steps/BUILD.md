All gates green. Implementation was already complete from prior sessions. The output below is the BUILD.md summary:

---

Cycle 0112 — Move commit/push/PR from workflow steps to engine-level behavior. All PLAN.md tasks (1–7) complete.

**Files created or modified:**
- `src/engine/commit-cycle.ts` (new, ~200 lines) — `commitCycle()`, `stageFiles()`, `buildClosesBlock()`
- `src/engine/workflow.ts` — `CommitConfig` type, `EngineConfig.commit` field, `loadConfig()` validation
- `src/engine/run-cycle.ts` — replaced `loadWorkflow` with `loadConfig` + find; all `wf.no_branch` guards replaced with `cfg.engine.commit.mode !== "worktree-pr"`
- `src/cli.ts` — imported `commitCycle`; wired after `cycle.end ok` in both resume and main drain paths
- `src/defaults/workflows.yml` + `.cycle/workflows.yml` — added `engine.commit: { mode: trunk, push: true }`; removed `commit`/`pr` steps; removed `no_branch`
- `tests/engine/commit-cycle.test.ts` (new, 10 test cases)
- `tests/engine/workflow.test.ts` — 3 new engine.commit parse tests
- `tests/defaults/feature-yaml.test.ts`, `quickfix-yaml.test.ts`, `dogfood/feature-yaml.test.ts`, `feature-loadable.test.ts`, `scripts.test.ts` — step-order assertions updated
- `docs/ENGINE.md` — "Engine-managed commit lifecycle" section added
- Deleted: `src/defaults/scripts/{commit.sh,commit-trunk.sh,pr.sh,lib/closes.sh}`, `.cycle/scripts/` same four, `tests/defaults/{commit_sh,commit-staging,closes-linkage,pr-auto-merge-fallback,pr-restart-tolerance}.test.ts`

**Test run:** `npm test` — 429 pass, 0 fail.

**Coverage:** `npm run test:coverage` + `npm run check:coverage` — Line 99.16%, Branch 92.04%, Function 97.22%. Per-file floors: `commit-cycle.ts` 99.53% ≥ 95%, `triage.ts` 99.45% ≥ 95%, `issue-lifecycle.ts` 100% ≥ 95%. No regressions.

**Typecheck:** `npm run typecheck` — clean, 0 warnings.

**Deviations from PLAN.md:** None. All 7 tasks implemented as specified.

**Deferred work:** `worktree-pr` and `review-pr` modes (per SPEC out-of-scope).

## Touched Files
- src/engine/workflow.ts
- src/engine/commit-cycle.ts
- src/engine/run-cycle.ts
- src/cli.ts
- src/defaults/workflows.yml
- .cycle/workflows.yml
- tests/engine/commit-cycle.test.ts
- tests/engine/workflow.test.ts
- tests/defaults/feature-yaml.test.ts
- tests/defaults/quickfix-yaml.test.ts
- tests/defaults/feature-loadable.test.ts
- tests/defaults/scripts.test.ts
- tests/dogfood/feature-yaml.test.ts
- src/defaults/scripts/commit.sh
- src/defaults/scripts/commit-trunk.sh
- src/defaults/scripts/pr.sh
- src/defaults/scripts/lib/closes.sh
- .cycle/scripts/commit.sh
- .cycle/scripts/commit-trunk.sh
- .cycle/scripts/pr.sh
- .cycle/scripts/lib/closes.sh
- tests/defaults/commit_sh.test.ts
- tests/defaults/commit-staging.test.ts
- tests/defaults/closes-linkage.test.ts
- tests/defaults/pr-auto-merge-fallback.test.ts
- tests/defaults/pr-restart-tolerance.test.ts
- docs/ENGINE.md
