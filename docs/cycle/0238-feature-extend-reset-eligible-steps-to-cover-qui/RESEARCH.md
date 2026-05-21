# Research: Cycle 0238

## Cycle Context

This cycle extends `RESET_ELIGIBLE_STEPS` in `src/engine/run-cycle.ts` to include `quick_fix`, `test_fix`, and `test_build` — the mutation steps used by the `quickfix` and `e2e-tests` workflows. Currently these step names are absent from the set, so `accumulateTouchedFiles` is never called for those workflows, `touched.json` is never written, and `commit.scope_warning` fires unconditionally on every staged `src/` file — a permanent false-positive that degrades signal quality for those workflows.

## Current Codebase State

### Relevant Components

- **`RESET_ELIGIBLE_STEPS` constant**: `new Set(["build", "fix", "final_fix"])` — `src/engine/run-cycle.ts:27`
- **`SKIP_ELIGIBLE_STEPS` constant**: `new Set(["spec", "research", "plan"])` — `src/engine/run-cycle.ts:33`. CLAUDE.md notes these two sets must remain disjoint.
- **`ARTIFACT_STEPS` constant**: `new Set(["spec", "research", "plan", "build", "review", "fix", "final_fix", "documentation"])` — `src/engine/run-cycle.ts:35`. Not relevant to this cycle but shows the pattern of hardcoded step-name sets.
- **`accumulateTouchedFiles` function**: async, reads pre-snapshot, runs `git status --porcelain` after step, diffs, merges into `touched.json` — `src/engine/run-cycle.ts:102–127`
- **pre-snapshot capture guard** (line 312): `if (step.name === "documentation" || RESET_ELIGIBLE_STEPS.has(step.name))` — captures `git status --porcelain` into `preSnapshot` before the step runs. Applies to both the `documentation` step (for `appendDocumentationPaths`) and all reset-eligible steps (for `accumulateTouchedFiles`). — `src/engine/run-cycle.ts:312`
- **snapshot-reset guard** (line 247 + 284): `const isResetEligible = RESET_ELIGIBLE_STEPS.has(step.name)` used at line 284 to conditionally capture `headSha` and at line 247 as the eligibility flag. Only relevant for `worktree-pr` mode; trunk mode bypasses the reset path. — `src/engine/run-cycle.ts:247`, `284`
- **`accumulateTouchedFiles` call site** (line 394): `if (r.status === "ok" && RESET_ELIGIBLE_STEPS.has(step.name))` — inside the `else` branch of `if (step.agent === "bash")`. This means bash-agent steps are structurally excluded from accumulation regardless of step name (documented in ENGINE.md:171 as a known limitation). All three new step names (`quick_fix`, `test_fix`, `test_build`) use `agent: claudecode`, so they will correctly reach this code path. — `src/engine/run-cycle.ts:394–398`
- **`commitCycle` scope-warning check**: reads `touched.json` from `opts.artifactDir`; emits `commit.scope_warning` for each staged `src/` or `scripts/` file absent from the set — `src/engine/commit-cycle.ts:121–150`
- **`commit.scope_warning` event shape**: `{ ts, event: "commit.scope_warning", cycle_id: string, files: string[] }` — `src/engine/commit-cycle.ts:149`

### Workflow Definitions — Authoritative Step Names

From `src/defaults/workflows.yml` (mirrored at `.cycle/workflows.yml`):

- **`quickfix` workflow** (lines 41–48):
  - `plan_fix` — `agent: claudecode` (not a mutation step, excluded from RESET_ELIGIBLE is intentional)
  - `quick_fix` — `agent: claudecode` — primary mutation step — line 46
  - `test_fix` — `agent: claudecode` — follow-up fix step — line 47
  - `verify` — `agent: bash`

- **`e2e-tests` workflow** (lines 50–59):
  - `research` — `agent: claudecode`
  - `test_plan` — `agent: claudecode`
  - `test_build` — `agent: claudecode` — primary build step — line 56
  - `review` — `agent: claudecode`
  - `fix` — `agent: claudecode` (`fix` already in RESET_ELIGIBLE_STEPS)
  - `verify` — `agent: bash`

All three target step names use `agent: claudecode`, placing them in the non-bash branch of `runCycle` where `accumulateTouchedFiles` is reachable.

### ENGINE.md Documentation

- **Section "touched.json footprint"**: `docs/ENGINE.md:151–169`
  - Line 153: names `build`, `fix`, `final_fix` as the accumulating steps — needs updating
  - Line 157: explicitly references `RESET_ELIGIBLE_STEPS` by name and lists its current members
  - Line 167: documents the known limitation verbatim: "`RESET_ELIGIBLE_STEPS` is hardcoded as `["build", "fix"]` in `run-cycle.ts`. The `quickfix` workflow uses `quick_fix` and `test_fix` as its mutation steps; the `e2e-tests` workflow uses `test_build`…" — this is the limitation this cycle resolves; the text must be updated or removed

### Dependencies & Integration Points

- `src/engine/run-cycle.ts` — only file requiring a code change
- `src/defaults/workflows.yml` — read-only reference; authoritative source for step names `quick_fix`, `test_fix`, `test_build`
- `src/engine/commit-cycle.ts` — reads `touched.json` and emits `commit.scope_warning`; no code changes required
- `docs/ENGINE.md` — documentation update required: section at lines 153–167
- `tests/engine/run-cycle.test.ts` — new tests extend this file; no existing tests cover `quick_fix`, `test_fix`, or `test_build` footprint accumulation

## Code References

- `src/engine/run-cycle.ts:27` — `RESET_ELIGIBLE_STEPS` declaration: `new Set(["build", "fix", "final_fix"])`
- `src/engine/run-cycle.ts:247` — `const isResetEligible = RESET_ELIGIBLE_STEPS.has(step.name)` — eligibility flag used by the snapshot-reset path
- `src/engine/run-cycle.ts:284` — `if (isResetEligible && cfg.engine.commit.mode === "worktree-pr")` — snapshot-reset guard entry; will automatically apply to new step names after constant is extended
- `src/engine/run-cycle.ts:312` — `if (step.name === "documentation" || RESET_ELIGIBLE_STEPS.has(step.name))` — pre-snapshot capture; will automatically apply to new step names
- `src/engine/run-cycle.ts:394` — `if (r.status === "ok" && RESET_ELIGIBLE_STEPS.has(step.name))` — `accumulateTouchedFiles` call site; inside `else` branch of `if (step.agent === "bash")`
- `src/engine/run-cycle.ts:102–127` — `accumulateTouchedFiles` function body
- `src/engine/commit-cycle.ts:121–150` — `touched.json` read + `commit.scope_warning` emission
- `src/defaults/workflows.yml:41–59` — `quickfix` and `e2e-tests` workflow definitions
- `docs/ENGINE.md:151–169` — touched.json footprint documentation section; contains the known-limitation text to update
- `tests/engine/run-cycle.test.ts:1–1630` — full test suite; no existing touched.json or footprint tests present

## Test Infrastructure

- **Framework**: Node built-in `node:test` with `node:assert` strict mode. No external test runner.
- **Pattern**: Each test creates a `mkdtemp` temp directory, initializes a real git repo, writes a `.cycle/workflows.yml` inline using `workflowYml()` (trunk mode) or `workflowYmlBranch()` (worktree-pr mode) helpers, places a fake `claude` binary in a temp bin dir, runs `runCycle`, and asserts on log events and filesystem state.
- **Fake agent pattern**: `await writeFile(fake, "#!/bin/bash\n...\n", "utf8"); await chmod(fake, 0o755);` — the fake binary emits stdout and optionally mutates files to simulate agent work.
- **File mutation in tests**: tests that need to simulate `src/` file changes write directly to `src/stub.ts` inside the fake `claude` binary script (e.g., `printf 'fix\\n' >> src/stub.ts`).
- **Log assertion style**: `readFile(...log.jsonl)` then `assert.match(log, /pattern/)` or `log.split("\n").filter(...)` with cardinality checks. Convention from CLAUDE.md: exactly-once events must use `filter(...).length === 1`, not bare `find`.
- **Workflow helper functions**: `workflowYml(stepsBody)` (trunk mode, `mode: trunk`) at line 33; `workflowYmlBranch(stepsBody)` (worktree-pr mode) at line 15 — both hard-code a single `feature` workflow; new tests for `quick_fix` will define a custom `quickfix` workflow inline.
- **Coverage floor**: `src/engine/run-cycle.ts` floor is 90% line coverage, enforced by `scripts/coverage-gate.mjs`.

## Open Questions

- The SPEC requires a test asserting `commit.scope_warning` is NOT emitted for a `quick_fix` step whose `touched.json` covers all staged files. This requires either calling `commitCycle` directly in the test or verifying through the log after a full run through the supervisor. The existing test suite never calls `commitCycle` from within `run-cycle.test.ts` — the plan must clarify whether the scope-warning assertion belongs in `run-cycle.test.ts` (by inspecting `touched.json` content only) or requires a separate test in `commit-cycle.test.ts` that reads a pre-written `touched.json`.
- The SPEC does not require regression tests for the snapshot-reset behavior of the new step names under `worktree-pr` mode (i.e., `head_sha` capture and reset-on-resume for `quick_fix`). It is unclear whether the planner should add such tests or treat them as out of scope.
