About to emit SPEC to stdout for cycle 0041 — chose hard-reset (mirror of cycle 0040's `build` policy) generalized to also cover `fix`.

# SPEC — Cycle 0041: Define + enforce restart policy for `fix` step

## Objective
Extend the engine's existing hard-reset restart policy (currently scoped to `build`) so it also covers the `fix` step — the other `feature`-workflow step that mutates the cycle branch via staff-engineer review feedback in `MUST-FIX.md`. On resume of a halted `fix`, the engine must rewind the cycle branch to the SHA recorded in the prior `step.start` event and re-run the agent from a clean slate, so retries are deterministic and never compound partial fix edits with fresh ones. This cycle delivers: generalization of the per-step finder + capture/reset gate to include `fix`, the matching self-healing warnings, the `no_branch` skip, the test matrix, and the CLAUDE.md doc extension. Restart behavior for `build` is unchanged.

## Source Issue
`step-restart-tolerance-audit-fix-step-policy` — "Define + enforce restart policy for `fix` step (partial fixes already applied)"

## Scope

### In Scope
- Generalize the per-step pre-SHA finder from build-only to step-parameterized in `src/engine/run-cycle.ts`: introduce `findPriorStepHeadSha(repoRoot, cycleId, stepName)` (or rename `findPriorBuildHeadSha` and add a `stepName` arg with `build` callers preserved). Extend the capture/reset gate in the step loop so both `step.name === "build"` and `step.name === "fix"` capture `head_sha` on fresh `step.start` and hard-reset on resume entry.
- Self-healing `step.warning` events for the fix path — `fix_pre_sha_missing` (no prior row / older log without `head_sha`) and `fix_pre_sha_unreachable` (commit garbage-collected / never persisted) — both skip the reset and re-emit `step.start` with the current HEAD as `head_sha`, mirroring the build path.
- Tests in `tests/engine/run-cycle.test.ts` covering fresh-run SHA capture on `fix`, resume hard-reset happy path for `fix`, both `fix_pre_sha_*` warning paths, and `no_branch: true` skip for `fix`. Build-step tests remain green.
- CLAUDE.md "Build-step restart policy" paragraph upgraded to a unified "Restart policy (hard reset to pre-step HEAD)" entry covering both `build` and `fix`, listing all four warning reasons and the unchanged non-reset step list (`spec` / `research` / `plan` / `review` / `verify` / `commit` / `pr` / `reflection`).

### Out of Scope
- Skip-if-done / re-evaluation prompt rewrite of `fix.md` (issue option 1) — rejected; see Decision below.
- Restart-tolerance of the prompt-overwrite + already-idempotent steps (`spec`, `research`, `plan`, `review`, `verify`, `commit`, `pr`, `reflection`) — separate child if needed.
- Restart-tolerance of `build` — already shipped in cycle 0040; this cycle does not touch its behavior.
- Auto-recovery of orphaned cycle branches from prior aborted runs.

## Requirements
- `step.start` events for `step.name === "fix"` on branch-based workflows MUST include a `head_sha` field equal to the cycle-branch HEAD immediately before the agent runs.
- On a resumed `fix` step (i.e. the first iteration of the workflow loop after `engine.resume` lands on `fix`), the engine MUST call `findPriorStepHeadSha(repoRoot, cycleId, "fix")`. If the result is a reachable SHA, hard-reset the cycle branch to that SHA before invoking the agent; if the result is `null` / `"missing"` / unreachable, emit the appropriate `step.warning` and skip the reset.
- The hard-reset MUST go through the existing `resetCycleBranchTo(repoRoot, sha)` primitive — no new git plumbing; the existing `cycle/`-branch guard already protects against operator misuse.
- A missing or unreachable prior `head_sha` for `fix` MUST still re-emit `step.start` with `head_sha = currentHead`, so the next resume self-heals onto the policy.
- For workflows with `no_branch: true`, the entire capture + reset path is skipped for `fix` (no `head_sha` on `step.start`, no resume reset) — same shape as `build`.
- Non-reset agent steps (`spec`, `research`, `plan`, `review`, `verify`, `commit`, `pr`, `reflection`) MUST NOT emit `head_sha` and MUST NOT be reset.
- Existing `build`-step behavior, events, and warning reasons MUST remain bit-for-bit unchanged.
- Coverage must not regress: line ≥ 95%, branch ≥ 75%, function ≥ 90%.

## Acceptance Criteria
- [ ] `src/engine/run-cycle.ts` capture/reset gate triggers for both `build` and `fix` (not only `build`).
- [ ] `findPriorStepHeadSha(repoRoot, cycleId, stepName)` returns the prior `head_sha` for the matching `(cycle_id, step)`, returns `"missing"` when that `step.start` lacks the field, returns `null` when no matching row exists or `log.jsonl` is unreadable. The existing `findPriorBuildHeadSha` semantics for `build` are preserved (either via rename + thin wrapper or by replacing internal call sites).
- [ ] `step.warning` emitted with `reason: "fix_pre_sha_missing"` when no prior `head_sha` is found for `fix`.
- [ ] `step.warning` emitted with `reason: "fix_pre_sha_unreachable"` (with the unreachable `sha` in the payload) when the prior `fix` `head_sha` does not resolve to a commit.
- [ ] On `no_branch: true` workflows, `step.start` for `fix` does NOT include `head_sha` and resume does NOT reset.
- [ ] Test asserts a resumed `fix` step rewinds an in-progress dirty branch back to the captured pre-`fix` SHA before re-running the agent, and that the final branch state matches a clean `fix` run (no double-applied edits, no missed items) — satisfies the issue's resume-equivalence acceptance check.
- [ ] Test asserts `fix` `step.start` events on `no_branch: true` and non-`fix`/non-`build` `step.start` events never carry `head_sha`.
- [ ] Existing cycle-0040 build-step tests still pass without modification.
- [ ] CLAUDE.md "Restart policy" paragraph names hard-reset, lists all four warning reasons (`build_pre_sha_missing`, `build_pre_sha_unreachable`, `fix_pre_sha_missing`, `fix_pre_sha_unreachable`), the `no_branch` skip, and the explicit non-reset of the prompt-overwrite + bash steps.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes with no warnings.
- [ ] `npm run test:coverage` meets baselines (line ≥ 95%, branch ≥ 75%, func ≥ 90%); report numbers in `BUILD.md`.

## Decision: Option 1 (skip-if-done prompt) vs Option 2 (hard reset)

**Chosen: Option 2 — hard reset to pre-`fix` HEAD on resume.** This is the same policy already shipped for `build` (called "Policy 1" in `CLAUDE.md`); we are extending it, not introducing a second mechanism.

| Dimension | Option 1 (skip-if-done prompt) | Option 2 (hard reset) — chosen |
|---|---|---|
| Determinism | Agent must re-evaluate each `MUST-FIX.md` item against current code per resume — output depends on partial-edit shape. | Each retry starts from identical pre-`fix` state. |
| Testability | No clean oracle: "is item X already satisfied?" is an LLM judgement call per item, per resume. | Single observable post-reset state per retry; final branch state matches a clean run. |
| Prompt cost | `fix.md` rewrite + structured `MUST-FIX.md` schema the agent reliably reads on every (not just resume) invocation. Extra cognitive load every cycle. | `fix.md` unchanged — agent always sees a clean branch. |
| Lost-work risk | Edits preserved but unfinished state can push the agent into a worse final result than a clean restart. | Bounded — `fix` halts before commit, so no merged history is lost; only unfinished review edits go. |
| Mechanism reuse | Net-new code path; mechanism diverges from `build`. | Reuses `findPriorStepHeadSha` + `resetCycleBranchTo` + warning scaffold; one mechanism for both mutating steps. |
| Implementation cost | Prompt rewrite + structured checklist format + agent-side reconciliation logic with no clean test oracle. | One `stepName` parameter on the finder + extending the gate predicate from `=== "build"` to `∈ {"build","fix"}`. |

Option 2 wins on the same arguments that selected hard-reset for `build` in cycle 0040: deterministic retries are testable, the lost-work surface is narrow (pre-commit only), and reusing one mechanism keeps the engine's restart semantics legible.

## Testing Strategy
- Framework: Node's native test runner (`node --test`), spec reporter, invoked via `npm test`.
- `tests/engine/run-cycle.test.ts` — add `fix`-step counterparts to the existing `build` cases:
  - `findPriorStepHeadSha("fix")`: returns `null` when no prior `fix` `step.start` row matches the cycle id; returns `"missing"` when the prior row lacks `head_sha`; returns the SHA when present.
  - Fresh run lands on `fix`: `fix` `step.start` carries `head_sha` equal to current HEAD.
  - Resume happy path: dirty cycle branch (partial fix edits) is hard-reset to the prior `fix` `head_sha`; final branch state matches a clean `fix` run; a fresh `step.start` re-emits the same `head_sha`.
  - Resume warning paths: `fix_pre_sha_missing` (no prior row / no field) and `fix_pre_sha_unreachable` (SHA absent in repo) each emit their warning, skip the reset, and re-emit `step.start` with current HEAD.
  - `no_branch: true` workflow: `fix` `step.start` omits `head_sha` on both fresh and resume entry; no reset is attempted.
  - Regression: the existing build-step test matrix continues to pass (re-run, no edits).
- Coverage: `npm run test:coverage` must report line ≥ 95%, branch ≥ 75%, func ≥ 90%, and must not regress per-file numbers.

No UI surface in this cycle — no Playwright / E2E test required.

## Documentation Updates
- **CLAUDE.md**: rewrite the "Build-step restart policy" paragraph under the engine "Resume from log tail" entry into a unified "Restart policy (hard reset to pre-step HEAD)" entry that names the policy, the set of reset-eligible steps (`build`, `fix`), the capture point on fresh `step.start`, the resume reset, all four `step.warning` reasons (`build_pre_sha_missing`, `build_pre_sha_unreachable`, `fix_pre_sha_missing`, `fix_pre_sha_unreachable`), the `no_branch` skip, and the explicit non-reset of `spec` / `research` / `plan` / `review` / `verify` / `commit` / `pr` / `reflection`.
- **README.md**: no user-facing surface change; no update required.
- **`src/defaults/prompts/fix.md`**: no change — hard reset means the agent always sees a clean branch on every (re)run of `fix`, so no partial-state caveat is needed in the prompt.

Documentation is part of "done" — the CLAUDE.md rewrite must land in this cycle's commits.

## Dependencies
- Existing engine modules: `src/engine/run-cycle.ts`, `src/engine/branch.ts`, `src/engine/log.ts`, `src/engine/log-tail.ts`, `src/engine/workflow.ts`.
- Existing primitives shipped in cycle 0040: `resetCycleBranchTo`, `shaExists`, `revParseHead`, `findPriorBuildHeadSha` (to be generalized).
- `git` on PATH for child `git reset --hard`, `git rev-parse`, `git cat-file -e` calls.
- Node ≥ 22.6 (project-wide).
- No new env vars, no external services.
