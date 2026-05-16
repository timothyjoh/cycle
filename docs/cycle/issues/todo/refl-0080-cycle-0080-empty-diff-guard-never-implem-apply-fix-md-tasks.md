---
id: refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks
title: Implement empty-diff post-condition guard in run-cycle.ts (apply FIX.md Tasks 1–2)
workflow: quickfix
depends_on: []
triaged_at: "2026-05-16T00:17:14.464Z"
source: triage
parent: refl-0080-cycle-0080-empty-diff-guard-never-implem
---
## Background

Cycle 0080 closed with `cycle.end status:ok` and a commit titled "Add empty-diff post-condition guard to build and fix steps" — but the guard was never implemented. The `build` and `fix` steps were permission-blocked during that cycle and wrote only placeholder artifacts. The cycle closed via the verify/commit path despite zero code changes in `src/engine/run-cycle.ts`.

The source issue `refl-0078-build-and-fix-steps-silently-succeed-whe` has since drained to `done/`, creating a traceability gap: `git log` suggests the feature shipped when it did not. The following symbols are **absent** from `src/engine/run-cycle.ts`: `EMPTY_DIFF_GUARD_STEPS`, `formatBuildGuardError`, the `spawnSync` import for the guard, and the guard `else if` block.

The complete implementation is written and waiting in `docs/cycle/0080-feature-add-empty-diff-post-condition-guard-to-b/FIX.md` Tasks 1 and 2. Apply that exactly — no research or planning needed.

## What to implement

Apply **FIX.md Tasks 1–2** verbatim from `docs/cycle/0080-feature-add-empty-diff-post-condition-guard-to-b/FIX.md`.

### Task 1 — `src/engine/run-cycle.ts` changes

Add and export:
- `EMPTY_DIFF_GUARD_STEPS`: `Set<string>` naming the guarded steps (`build`, `fix`)
- `formatBuildGuardError(stepName: string, preSha: string): string` — produces the capped stderr string for a guard-fired failure
- `spawnSync` import from `node:child_process` (for the diff check)

At the agent-branch seam for each guarded step, after the agent returns `r.status === "ok"`:
- Run `spawnSync("git", ["diff", "--quiet", preSha, "HEAD"], { cwd: repoRoot })`
- If exit code is `0` (no diff), flip `r.status = "failed"` and set `r.stderr = formatBuildGuardError(step.name, preSha)` (capped to `MAX_STEP_END_STDERR`)
- Skip the guard entirely when `workflow.no_branch === true` (no cycle branch exists, no `head_sha` captured)
- Skip when `preSha` is `undefined` / missing (resume edge case; consistent with existing `build_pre_sha_missing` warning path — do not flip to failed)

### Task 2 — `tests/engine/run-cycle.empty-diff-guard.test.ts`

Add the 6 test scenarios exactly as written in FIX.md:
1. **Normal case (build)**: non-empty diff after build step → `r.status` remains `ok`, guard does not fire
2. **Guard fires on build**: empty diff (git diff exits 0) → `step.end status:"failed"`, `stderr` matches `formatBuildGuardError("build", sha)`
3. **Guard fires on fix**: same as scenario 2 but for the `fix` step
4. **`no_branch: true` workflow**: guard skipped entirely; no `spawnSync` call for the diff check; step remains `ok`
5. **Pre-SHA missing**: `head_sha` absent from prior `step.start` → guard skipped; step remains `ok`, no failure emitted
6. **`formatBuildGuardError` shape**: exported helper returns a string containing both the step name and the sha

## Verification

After applying both tasks:

```
npm test                 # full suite must pass, including all 6 new guard scenarios
npm run test:coverage    # line ≥ 95% / branch ≥ 75% / function ≥ 90%
```

## Acceptance criteria

- `EMPTY_DIFF_GUARD_STEPS`, `formatBuildGuardError`, and the guard `else if` block are present and exported in `src/engine/run-cycle.ts`
- Guard invokes `git diff --quiet <pre-step-sha> HEAD` only when step result is `ok` and workflow is branch-based
- Empty diff (exit code 0) produces `step.end status:"failed"` with `stderr` from `formatBuildGuardError`, truncated to `MAX_STEP_END_STDERR`
- `no_branch: true` workflows and missing `preSha` skip the guard without flipping status
- All 6 test scenarios in `tests/engine/run-cycle.empty-diff-guard.test.ts` pass
- Coverage baseline not regressed: line ≥ 95% / branch ≥ 75% / function ≥ 90%
