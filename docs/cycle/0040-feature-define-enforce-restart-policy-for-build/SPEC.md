Emitting SPEC for cycle 0040 to stdout.

# SPEC — Cycle 0040: Define + enforce restart policy for `build` step

## Objective
Lock in **Policy 1 (hard reset to pre-`build` HEAD)** as the engine's restart-tolerance behavior for the `build` step — the only `feature`-workflow step that mutates the cycle branch in the shipped (consumer-facing) default. On resume of a halted `build`, the engine must rewind the cycle branch to the SHA recorded in the prior `step.start` event and re-run the agent from a clean slate, so retries are deterministic and never compound partial edits from earlier attempts. This cycle delivers the full policy: pre-build SHA capture on fresh runs, hard-reset on resume, self-healing warnings for missing/unreachable SHAs, the `no_branch` skip, the test matrix, and the CLAUDE.md documentation paragraph.

## Source Issue
`step-restart-tolerance-audit-build-step-policy` — "Define + enforce restart policy for `build` step (partial code on branch)"

## Scope

### In Scope
- Policy 1 implementation in `src/engine/run-cycle.ts` + `src/engine/branch.ts`: capture `head_sha` on fresh `build` `step.start`; on resume entry to `build`, scan `.cycle/log.jsonl` backwards for the matching `step.start`, `git reset --hard` the cycle branch to its `head_sha` when reachable, then emit a fresh `step.start` re-carrying that SHA so subsequent resumes self-heal.
- Self-healing `step.warning` events — `build_pre_sha_missing` (older log row without `head_sha`, or no prior `step.start` row found) and `build_pre_sha_unreachable` (commit garbage-collected / never persisted) — both skip the reset and re-emit `step.start` with the current HEAD as `head_sha`.
- `no_branch` workflows skip both the capture and the reset entirely — no `head_sha` on `step.start`, no `git reset --hard` on resume.
- Non-`build` steps (`spec`, `research`, `plan`, `review`, `fix`, `verify`, `commit`, `pr`, `reflection`) MUST NOT carry `head_sha` and MUST NOT be reset.
- Tests in `tests/engine/branch.test.ts` and `tests/engine/run-cycle.test.ts` covering `resetCycleBranchTo` guards, `findPriorBuildHeadSha` parsing, fresh-run SHA capture, resume hard-reset happy path, and both warning paths.
- CLAUDE.md "Build-step restart policy" paragraph under the engine architecture / resume-from-log-tail section.

### Out of Scope
- Restart-tolerance of the `fix` step (separate child issue under the same parent audit).
- Restart-tolerance of the prompt-overwrite steps (`spec`, `research`, `plan`, `review`, `reflection`) — each is idempotent via a single artifact-file overwrite to stdout and is explicitly NOT reset; tracked as a separate child if needed.
- Policy 2 (continue on top of partial work) — rejected; see Decision below.
- Auto-recovery of orphaned cycle branches from prior aborted runs.

## Requirements
- `step.start` events for `step.name === "build"` on branch-based workflows MUST include a `head_sha` field equal to the cycle branch HEAD immediately before the agent runs.
- On a resumed `build` step (i.e. the first iteration of the workflow loop after `engine.resume`), the engine MUST call `findPriorBuildHeadSha(repoRoot, cycleId)`. If the result is a reachable SHA, hard-reset the cycle branch to that SHA before invoking the agent; if the result is `null` / `"missing"` / unreachable, emit the appropriate `step.warning` and skip the reset.
- `resetCycleBranchTo(repoRoot, sha)` MUST refuse to run when HEAD is not on a `cycle/` branch and MUST surface the guard error to the caller (defensive against operator misuse).
- A missing or unreachable prior `head_sha` MUST still re-emit `step.start` with `head_sha = currentHead`, so the next resume self-heals onto Policy 1.
- For workflows with `no_branch: true`, the entire capture + reset path is skipped: no `head_sha` on `step.start`, no resume reset.
- Non-`build` agent steps MUST NOT emit `head_sha` and MUST NOT be reset, even on resume entry.
- Coverage must not regress: line ≥ 95%, branch ≥ 75%, function ≥ 90%.

## Acceptance Criteria
- [ ] `src/engine/run-cycle.ts` captures `head_sha` on fresh `build` `step.start`; resume path runs `resetCycleBranchTo(prior)` when reachable.
- [ ] `src/engine/run-cycle.ts:findPriorBuildHeadSha` returns the prior `head_sha` for the matching `cycle_id`, returns `"missing"` when the prior `step.start` lacks the field, returns `null` when no matching row exists or `log.jsonl` is unreadable.
- [ ] `src/engine/branch.ts:resetCycleBranchTo` throws when HEAD is not on a `cycle/` branch or cannot be resolved.
- [ ] `step.warning` emitted with `reason: "build_pre_sha_missing"` when no prior `head_sha` is found.
- [ ] `step.warning` emitted with `reason: "build_pre_sha_unreachable"` (with the unreachable `sha` in the payload) when the prior `head_sha` does not resolve to a commit.
- [ ] On `no_branch: true` workflows, `step.start` for `build` does NOT include `head_sha` and resume does NOT reset.
- [ ] Test asserts a resumed `build` step rewinds an in-progress dirty branch back to the captured SHA before re-running the agent.
- [ ] Test asserts non-`build` `step.start` events never carry `head_sha`.
- [ ] CLAUDE.md "Build-step restart policy" paragraph names Policy 1, the warning reasons, the `no_branch` skip, and the explicit non-reset of the prompt-overwrite steps.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes with no warnings.
- [ ] `npm run test:coverage` meets baselines (line ≥ 95%, branch ≥ 75%, func ≥ 90%); report numbers in `BUILD.md`.

## Decision: Policy 1 vs Policy 2

**Chosen: Policy 1 — hard reset to pre-`build` HEAD on resume.**

| Dimension | Policy 1 (hard reset) | Policy 2 (continue on partial) |
|---|---|---|
| Determinism | Each retry starts from identical state. | Agent sees a non-deterministic mix of prior partial edits + fresh prompt. |
| Testability | Single observable post-reset state per retry. | Combinatorial explosion of partial-state shapes; no good test oracle. |
| Lost-work risk | Bounded — `build` halts before the agent has committed, so no merged history is lost; only unfinished edits go. | Edits preserved, but unfinished state may push the agent into a worse final result than a clean restart. |
| Prompt complexity | `build.md` unchanged. | Prompt must explicitly handle "you may see partial prior output" — extra cognitive load every run, not just on retry. |
| Implementation cost | One SHA on one event, one `git reset --hard` on resume. | Prompt rewrite + agent-side reconciliation logic with no clean test oracle. |

Policy 1 wins because (a) `build` is the only mutating step in `feature` and the agent has not committed at the time a halt occurs, so the lost-work surface is narrow; (b) deterministic retries are testable and reasoning-friendly; (c) it costs one extra field on one event plus one reset call on resume entry.

## Testing Strategy
- Framework: Node's native test runner (`node --test`), spec reporter, invoked via `npm test`.
- `tests/engine/branch.test.ts`:
  - `resetCycleBranchTo` discards staged + unstaged + untracked changes back to the target SHA on a `cycle/` branch.
  - `resetCycleBranchTo` refuses on a non-`cycle/` branch and surfaces the guard error.
  - `resetCycleBranchTo` refuses when HEAD cannot be resolved.
  - `shaExists` returns true for a reachable commit, false for a fabricated SHA.
- `tests/engine/run-cycle.test.ts`:
  - `findPriorBuildHeadSha`: returns `null` when `log.jsonl` is missing; returns `"missing"` when the prior `build` `step.start` lacks `head_sha`; returns `null` when no `build` `step.start` row matches the cycle id; returns the SHA when present.
  - Fresh run: `build` `step.start` carries `head_sha` equal to current HEAD; `spec` / non-build `step.start` events do not carry it.
  - Resume happy path: dirty cycle branch is hard-reset to the prior `head_sha`; a fresh `step.start` re-emits the same `head_sha`.
  - Resume warning paths: `build_pre_sha_missing` (no prior row / no field) and `build_pre_sha_unreachable` (SHA absent in repo) each emit their warning, skip the reset, and re-emit `step.start` with current HEAD.
  - `no_branch: true` workflow: `build` `step.start` omits `head_sha` on both fresh and resume entry; no reset is attempted.
- Coverage: `npm run test:coverage` must report line ≥ 95%, branch ≥ 75%, func ≥ 90%, and must not regress per-file numbers.

No UI surface in this cycle — no Playwright / E2E test required.

## Documentation Updates
- **CLAUDE.md**: extend the engine "Resume from log tail" entry with a `Build-step restart policy` paragraph that names Policy 1, the `head_sha` capture point, the resume reset, both `step.warning` reasons, the `no_branch` skip, and the explicit non-reset of `spec` / `research` / `plan` / `review` / `fix` / `verify` / `commit` / `pr` / `reflection`.
- **README.md**: no user-facing surface change; no update required.
- **`src/defaults/prompts/build.md`**: no change — Policy 1 means the agent always sees a clean branch, so no partial-state caveat is needed.

Documentation is part of "done" — the CLAUDE.md paragraph must land in this cycle's commits.

## Dependencies
- Existing engine modules: `src/engine/run-cycle.ts`, `src/engine/branch.ts`, `src/engine/log.ts`, `src/engine/log-tail.ts`, `src/engine/workflow.ts`.
- `git` on PATH for child `git reset --hard`, `git rev-parse`, `git cat-file -e` calls.
- Node ≥ 22.6 (project-wide).
- No new env vars, no external services.
