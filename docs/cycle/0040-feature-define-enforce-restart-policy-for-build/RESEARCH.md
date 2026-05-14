Research complete. Writing RESEARCH.md to stdout.

# Research: Cycle 0040

## Cycle Context
SPEC.md (`docs/cycle/0040-feature-define-enforce-restart-policy-for-build/SPEC.md:1-93`) asks the engine to implement **Policy 1** for `build` step restart-tolerance: capture `head_sha` on the fresh `build` `step.start`, hard-reset the cycle branch back to that SHA on resume entry to `build`, emit `step.warning` (`build_pre_sha_missing` / `build_pre_sha_unreachable`) for self-healing edge cases, skip the entire capture/reset path on `no_branch: true` workflows, never emit `head_sha` on non-`build` steps, add a CLAUDE.md "Build-step restart policy" paragraph under the resume entry, and back the whole policy with `tests/engine/branch.test.ts` + `tests/engine/run-cycle.test.ts` cases. A substantial partial implementation already exists on the stale `cycle/feature/define-enforce-restart-policy-for-build` branch from the failed cycle 0038 attempt — the planner must explicitly decide to port or rewrite.

## Current Codebase State

### Relevant Components
- Cycle runner (workflow step loop, fresh + resume branching, artifact write, reflection ingest, post-cycle base checkout) — `src/engine/run-cycle.ts:32-136`. The single `step.start` emission lives at `src/engine/run-cycle.ts:73` and currently has no per-step variant payload.
- Branch helpers (create/checkout/base/pull and trunk artifact dir) — `src/engine/branch.ts:1-81`. Generic `git(repoRoot, args)` helper at `src/engine/branch.ts:5-15` and `revParse(repoRoot, ref)` at `src/engine/branch.ts:64-72` are the templates a Policy 1 implementation would reuse.
- Workflow config loader, `Workflow.no_branch?: boolean` flag, step shape — `src/engine/workflow.ts:5-72`.
- Logger (append-only JSONL, line = `{ts, event, ...fields}`) — `src/engine/log.ts:8-18`. Every event is one JSON object per line; new fields like `head_sha` and new events like `step.warning` are additive.
- Log-tail scanner that resume relies on (locates last `cycle.start` without matching `cycle.end`, collects `step.end status:ok`, also walks `step.start` from tail in `lastStepStarted` resolution at lines 58-81) — `src/engine/log-tail.ts:21-107`.
- CLI orchestrator + resume entrypoint that calls `runCycle({resume:{startStepIndex}})` — `src/cli.ts:189-291` (`runResumeOnce`).
- Active config for this repo (trunk-based, `no_branch: true` on the `feature` workflow) — `.cycle/workflows.yml:13-32`. The shipped consumer-facing default is at `src/defaults/workflows.yml` and is still branch-based.
- Build prompt the agent receives during a `build` step — `src/defaults/prompts/build.md` (unchanged by SPEC; Policy 1 means the agent always sees a clean branch).

### Existing Patterns to Follow
- Subprocess discipline: every `git` call uses `spawn(..., {shell:false})` with array args, captures `stderr`, resolves `null` on error rather than throwing. Templates at `src/engine/branch.ts:5-15` (`git`), `src/engine/branch.ts:64-72` (`revParse`), `src/engine/branch.ts:17-26` (`branchExists`), `src/engine/run-cycle.ts:13-21` (`currentBranch`). Any new `resetCycleBranchTo`, `shaExists`, `revParseHead`, `currentBranchName` helpers should mirror this.
- Optional payload fields spread into log events use `...(condition ? { key: val } : {})` — see `src/engine/run-cycle.ts:65` (`CYCLE_ISSUE_ID`), `src/cli.ts:135-136` (`failed_step`), `src/cli.ts:405-407` (`reason`, `halted_at_issue`).
- `no_branch` short-circuits anywhere the branch is touched: `src/engine/run-cycle.ts:47-58` (artifact dir vs branch creation), `src/engine/run-cycle.ts:111-114` (post-cycle checkout skip with `reason:"no_branch"`).
- Resume-only behavior is gated by `opts.resume`: `src/engine/run-cycle.ts:39-51` distinguishes resume vs fresh. SPEC defines "resume entry to `build`" as the loop iteration where `i === startStepIndex` AND `opts.resume` is set.
- Reflection step pattern for "skip on failure" semantics is at `src/engine/run-cycle.ts:97-100` — `step.warning` should follow a similar non-fatal pattern (emit + continue, do not flip `step.status` to failed).
- Tests use Node's native runner with `mkdtemp(tmpdir())` per-test repos, `spawnSync("git", …)` to set up + assert state, a stub `claude` binary on a private PATH dir. Template: any test in `tests/engine/branch.test.ts` or `tests/engine/run-cycle.test.ts` — e.g. the resume-mode test at `tests/engine/run-cycle.test.ts:438-507`.

### Dependencies & Integration Points
- `step.start` event shape is consumed by `parseLogTail` only for `step` + `cycle_id` (`src/engine/log-tail.ts:61-82`); adding `head_sha` to the payload is non-breaking. `step.warning` is a brand-new event name; no current parser reads it.
- Resume in `src/cli.ts:189-291` computes `startStepIndex` from `tail.completedSteps` and never inspects `step.start` payloads; the new Policy 1 logic lives entirely inside `runCycle` and does not require CLI changes.
- `findPriorBuildHeadSha` consumes `.cycle/log.jsonl` directly (reverse-scan, line-by-line `JSON.parse` in a `try/catch`). It can reuse the same parsing style as `parseLogTail` at `src/engine/log-tail.ts:22-30` but does not need to share code.
- `resetCycleBranchTo` is invoked only from `runCycle` on resume entry to `build` on branch-based workflows; no caller currently exists outside that path. The guard ("HEAD must be on `cycle/`") protects against operator misuse of the function if it ever escapes the engine.
- Coverage policy: `CLAUDE.md` Coverage section locks baselines (line ≥ 95%, branch ≥ 75%, func ≥ 90%) — these are exercised at `npm run test:coverage` and must not regress.

### Test Infrastructure
- Framework: Node's native `node:test`, spec reporter, run via `npm test` (`pretest` rebuilds `dist/`, see `CLAUDE.md` "Commands" table).
- Layout: `tests/engine/*.test.ts` mirrors `src/engine/*.ts`. Each test creates an isolated git repo via `mkdtemp` and tears it down in a `try/finally`.
- Helpers: `git(cwd, args)` (synchronous, throws on non-zero) at `tests/engine/branch.test.ts:10-14` and `tests/engine/run-cycle.test.ts:9-13`. `workflowYml(stepsBody)` template at `tests/engine/run-cycle.test.ts:15-28` constructs valid `.cycle/workflows.yml` bodies for the run-cycle tests.
- Coverage already exists for `branch.ts` (`tests/engine/branch.test.ts:16-222`) and `run-cycle.ts` (`tests/engine/run-cycle.test.ts:30-678`, including resume tests at lines 438-600).
- No Playwright/E2E surface in this cycle.

## Code References

### Files SPEC touches
- `src/engine/branch.ts:5-15` — `git()` helper template for new `resetCycleBranchTo`.
- `src/engine/branch.ts:64-72` — `revParse()` template for new `revParseHead` / `shaExists`.
- `src/engine/run-cycle.ts:13-21` — existing `currentBranch(repoRoot)` helper; functionally identical to the `currentBranchName` needed by `resetCycleBranchTo`'s guard (the partial implementation introduced a near-duplicate).
- `src/engine/run-cycle.ts:32-94` — `runCycle` entry, step loop, `step.start` emission point. The new capture/reset/warning logic must wrap line 73's `log.emit("step.start", …)`.
- `src/engine/run-cycle.ts:70-72` — `startIdx` computation (this is the "resume entry" boundary; first iteration where `i === startIdx` while `opts.resume` is set is the only iteration that needs the reset path).
- `src/engine/log.ts:8-18` — `createLogger.emit(event, fields)` — used for the new `step.warning` event.
- `CLAUDE.md:52` — single-paragraph "Resume from log tail" entry; SPEC says the new "Build-step restart policy" paragraph goes adjacent to this entry.

### Configuration
- `.cycle/workflows.yml:14-32` — local feature workflow is `no_branch: true` for this repo (trunk-based per `CLAUDE.md` "Workflow style"). The Policy 1 capture+reset path will therefore be skipped when the engine runs against this repo itself; the planner must rely on synthetic-fixture tests (branch-based `workflows.yml` strings inside test bodies, like the existing `workflowYml` helper) to exercise the branch-based path.
- `src/defaults/workflows.yml:29` — shipped consumer-facing `feature` workflow includes branch + PR steps; this is the workflow shape Policy 1 actually targets in production.

### Prior partial implementation (stale branch from cycle 0038)
A failed prior cycle attempt left a complete implementation on the branch `cycle/feature/define-enforce-restart-policy-for-build` (commit `9afac66`, "cycle 0038: Define + enforce restart policy for `build` step"). It is **not on master** but is reachable locally and on `origin`. Diff vs master:

- `src/engine/branch.ts` (+30 lines): adds `revParseHead`, private `currentBranchName`, exported `resetCycleBranchTo(repoRoot, sha)` with the `cycle/` guard, and `shaExists(repoRoot, sha)` using `git cat-file -e <sha>^{commit}`.
- `src/engine/run-cycle.ts` (+50 lines): adds `findPriorBuildHeadSha(repoRoot, cycleId)` (reverse-scans `.cycle/log.jsonl`, returns `null | "missing" | <sha>`); wraps the `step.start` emission in run-cycle's loop with the build/no_branch/resume gates and emits `step.warning` for both `build_pre_sha_missing` and `build_pre_sha_unreachable`; threads `head_sha` into `step.start` via conditional spread.
- `tests/engine/branch.test.ts` (+125 lines): covers `revParseHead` (happy + non-git), `resetCycleBranchTo` (success, non-cycle-branch refusal, unresolvable HEAD refusal, missing-cwd refusal), `shaExists` (HEAD true, synthetic SHA false, missing-cwd false).
- `tests/engine/run-cycle.test.ts` (+331 lines): adds a "Build-step restart policy" block — `findPriorBuildHeadSha` cases (missing log, "missing" field, no matching row), fresh-run `build` head_sha capture, non-build steps lack `head_sha`, resume happy-path reset on a dirty cycle branch, both warning paths, and `no_branch:true` skip.
- `CLAUDE.md` (+1 line) + `docs/ARCHITECTURE.md` (+5 lines).
- Workflow + artifact files for cycle 0038 (`docs/cycle/0038-feature-…/{SPEC,RESEARCH,PLAN,BUILD,REVIEW,FIX}.md`, `.cycle/workflows.yml`).

This branch is the "partial code on branch" the source issue title references. Cycle 0038 failed at the `pr` step (`.cycle/log.jsonl` 03:09:48Z: `git checkout main failed: error: pathspec 'main' did not match any file(s) known to git`) — the implementation passed `spec`/`research`/`plan`/`build`/`review`/`fix`/`verify`/`commit` before the engine's hard-coded `main` checkout collided with this repo's `master` base.

## Open Questions
- Should the planner port the existing implementation from `cycle/feature/define-enforce-restart-policy-for-build` (commit `9afac66`) onto master via a trunk-based commit, or re-implement from scratch? The partial code matches the SPEC closely; the only structural smell is the duplicated `currentBranch`/`currentBranchName` helper between `run-cycle.ts:13-21` and the partial `branch.ts` change.
- The repo's local `feature` workflow has `no_branch: true`, so this cycle's own `build` step on master will not exercise the branch-based capture/reset path end-to-end at runtime — verification has to come entirely from the synthetic test fixtures. Is that acceptable, or does the planner want a temporary branch-based workflow run added to CI?
- `findPriorBuildHeadSha` is logically log-tail-shaped but the partial implementation puts it in `run-cycle.ts` rather than `log-tail.ts`. SPEC's acceptance bullet ties the function to `src/engine/run-cycle.ts:findPriorBuildHeadSha`. The planner should confirm whether to keep it co-located with `runCycle` or move it next to `parseLogTail`.
- The partial implementation's `currentBranchName` in `branch.ts` duplicates `currentBranch` in `run-cycle.ts:13-21`. Worth consolidating into one exported helper in `branch.ts` before landing.
