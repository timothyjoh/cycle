---

# Research: Cycle 0099

## Cycle Context

Cycle 0099 completes two things cycle 0098 never shipped (blocked by permissions): (1) implement the empty-diff post-condition guard in `src/engine/run-cycle.ts` — three surgical edits adding a `spawnSync` import, two exports (`EMPTY_DIFF_GUARD_STEPS`, `formatBuildGuardError`), and an `else if` guard block after the existing spec-guard — and (2) add `tests/engine/run-cycle.empty-diff-guard.test.ts` with regression tests covering the guard, the bypass for `no_branch:true`, and the exported helpers.

## Current Codebase State

### Relevant Components

- **Guard insertion target (spec-guard block)**: `src/engine/run-cycle.ts:194–206` — the `if (step.name === "spec")` block that runs inside the `if (r.status === "ok" && step.name)` condition. The new `else if` appends to its closing `}` at line 205.
- **Existing exports to match as pattern**: `src/engine/run-cycle.ts:46–54` — `SPEC_MIN_BYTES`, `MAX_STEP_END_STDERR`, `truncateStepEndStderr`, `formatSpecGuardError`. All are exported bare constants and functions.
- **`RESET_ELIGIBLE_STEPS`**: `src/engine/run-cycle.ts:23` — `new Set(["build", "fix"])`, not exported, controls `headSha` capture and branch reset. The new `EMPTY_DIFF_GUARD_STEPS` covers the same step names but is distinct and must be exported.
- **`SKIP_ELIGIBLE_STEPS`**: `src/engine/run-cycle.ts:29` — `new Set(["spec", "research", "plan"])`, not exported. `EMPTY_DIFF_GUARD_STEPS` must stay disjoint from this (it is — `build`/`fix` vs `spec`/`research`/`plan`).
- **`wf.no_branch` access**: `src/engine/run-cycle.ts:110,117,156` — `wf` is in scope throughout the step loop; `wf.no_branch` is already used as a branch guard in multiple places.
- **`repoRoot` access**: `src/engine/run-cycle.ts:95` — `runCycle(repoRoot, opts)` first arg, in scope throughout the loop.
- **`r` (StepResult)**: `src/engine/run-cycle.ts:180,189` — mutable `let r: StepResult`; fields `r.status`, `r.exitCode`, `r.stderr` are mutated by the existing spec-guard at lines 201–203. Same mutation pattern for the new guard.
- **Imports section**: `src/engine/run-cycle.ts:1–22` — no `spawnSync` import yet. `writeFile, readFile, stat` from `node:fs/promises` at line 20. `spawnSync` must be added from `node:child_process`.
- **Artifact write seam**: `src/engine/run-cycle.ts:194–210` — the entire `if (r.status === "ok" && step.name)` block that writes artifact and handles step-specific post-conditions. The guard belongs inside this block, after the spec-guard.
- **Non-fatal step path**: `src/engine/run-cycle.ts:221–231` — `reflection` and `documentation` steps get `continue` instead of `return`; `build`/`fix` fall through to the normal `cycle.end status:failed` return.

### Existing Patterns to Follow

- **Exported set + formatter pair**: `SPEC_MIN_BYTES`/`formatSpecGuardError` — bare `export const` + bare `export function`. Match this for `EMPTY_DIFF_GUARD_STEPS`/`formatBuildGuardError`.
- **`r.status` mutation for guard failures**: `src/engine/run-cycle.ts:201–203` — `r.status = "failed"; r.exitCode = r.exitCode || 1; r.stderr = <message>`. Use identical mutation.
- **`spawnSync` with array args (subprocess discipline)**: `tests/engine/run-cycle.spec-guard.test.ts:6,14-16` and project CLAUDE.md — always `spawn`/`spawnSync` with array args, never `shell: true`. The guard uses `spawnSync("git", ["diff", "HEAD"], { cwd: repoRoot, encoding: "utf8" })`.
- **`!diff.stdout` empty-diff check**: The guard condition is `diff.status === 0 && !diff.stdout` — non-zero git exit is NOT a guard trigger (don't flip to failed on git error).
- **Test setup pattern**: `tests/engine/run-cycle.spec-guard.test.ts:35–66` — `mkdtemp` for both a git repo and a fake binary tmpdir, `git init -b main`, empty commit, write `workflows.yml` + prompt, write fake shell script, `chmod 0o755`. Inject via `env: { PATH: bin:${process.env.PATH} }`.
- **Parameterization over `noBranch`**: `tests/engine/run-cycle.spec-guard.test.ts:68` — `for (const noBranch of [false, true])` loop. The empty-diff guard test needs separate tests per branch type (guard fires vs guard bypassed).
- **Log assertion pattern**: read `log.jsonl` as UTF-8 string, assert regex matches against JSON event shapes. `assert.match` / `assert.doesNotMatch`.

### Dependencies & Integration Points

- **`StepResult` type**: `src/engine/exec-bash.ts` — `{ status: "ok"|"failed"; exitCode: number; stdout: string; stderr: string }`. `r.stderr` is already a string field on `StepResult`.
- **`wf` from `loadWorkflow`**: `src/engine/workflow.ts` — has `wf.no_branch?: boolean` and `wf.steps[]`. No new fields needed.
- **`truncateStepEndStderr`**: `src/engine/run-cycle.ts:49-50` — already used at line 217 when emitting `step.end`. The new guard must also set `r.stderr` within `MAX_STEP_END_STDERR`; `formatBuildGuardError` output is short enough to be under the cap, but it's advisable to truncate for consistency (the FIX.md from 0080 does NOT truncate at the guard site — `truncateStepEndStderr` is applied at the emit site, line 217, which already covers it).

### Test Infrastructure

- **Framework**: Node native `node:test` runner — `import { test } from "node:test"`, `import { strict as assert } from "node:assert"`. Used by every file in `tests/engine/`.
- **Test file naming**: `run-cycle.<feature>.test.ts` — the new file must be `tests/engine/run-cycle.empty-diff-guard.test.ts`.
- **No mocking**: real `git` repo, real `spawnSync`, fake binary in tmpdir on `PATH`. No `mock.*` or stubs from test framework.
- **Existing test files covering the change area**: `tests/engine/run-cycle.spec-guard.test.ts` (216 lines, 9 tests — the direct pattern reference), `tests/engine/run-cycle.test.ts` (general cycle), `tests/engine/run-cycle.step-end-stderr.test.ts`.
- **Coverage baseline**: line ≥ 95%, branch ≥ 75%, function ≥ 90% (CLAUDE.md). The new `else if` branch adds two new branches (guard fires / guard skips); tests must cover both.
- **`run-cycle.empty-diff-guard.test.ts` does not yet exist** — confirmed via `ls tests/engine/`.

## Code References

- `src/engine/run-cycle.ts:1` — imports section; `spawnSync` must be added here
- `src/engine/run-cycle.ts:20` — `import { writeFile, readFile, stat } from "node:fs/promises"` — insert `spawnSync` import before or after this line
- `src/engine/run-cycle.ts:46–54` — export cluster for constants/formatters; `EMPTY_DIFF_GUARD_STEPS` and `formatBuildGuardError` go here
- `src/engine/run-cycle.ts:23` — `RESET_ELIGIBLE_STEPS` — sibling set, documents the distinction pattern
- `src/engine/run-cycle.ts:194–206` — spec-guard block; new `else if` attaches to closing `}` at line 205
- `src/engine/run-cycle.ts:207–210` — reflection check follows immediately; new guard must come before it (inside the agent-branch `if` block that closes at approximately line 210)
- `src/engine/run-cycle.ts:156` — `if (isResetEligible && !wf.no_branch)` — model for `!wf.no_branch` guard condition
- `tests/engine/run-cycle.spec-guard.test.ts:19–33` — `workflowYml` helper building a single-step workflow YAML with optional `no_branch`
- `tests/engine/run-cycle.spec-guard.test.ts:35–66` — `setupRepo` pattern (mkdtemp, git init, write yml + prompt, write fake binary, chmod)
- `tests/engine/run-cycle.spec-guard.test.ts:68` — `for (const noBranch of [false, true])` parameterization loop

## Open Questions

1. **`git diff HEAD` vs working tree**: The SPEC and FIX.md (0080 Change C) both use `git diff HEAD` (compares working tree against HEAD). If the agent commits its changes before exiting, `git diff HEAD` would be empty even with actual code changes. Should this be `git diff` (staged + unstaged) or `git diff HEAD` (all working tree)? The SPEC says `git diff HEAD` — document but do not change.

2. **`useBash` bypass**: The SPEC mentions the guard applies after the `else { ... }` agent-branch seam, meaning bash steps bypass naturally (they never enter that code path). The test suite should confirm bash-agent bypass. The FIX.md test suite includes a bash-bypass test; the SPEC's testing strategy table does not list it explicitly but the FIX.md is the authoritative test list.

3. **`encoding: "utf8"` on `spawnSync`**: Required to get `diff.stdout` as a string rather than `Buffer`. The FIX.md specifies `{ cwd: repoRoot, encoding: "utf8" }`. Without it, `!diff.stdout` would always be truthy (Buffer vs string).
