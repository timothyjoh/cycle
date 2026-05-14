```markdown
# SPEC — Cycle 0039: Define + enforce restart policy for `build` step

## Objective
Lock in **Policy 1 (hard reset to pre-build HEAD)** as the engine's restart-tolerance behavior for the `build` step, the only `feature`-workflow step that mutates the cycle branch. On resume of a halted `build`, the engine must rewind the cycle branch to the SHA recorded in the prior `step.start` event and re-run the agent from a clean slate, so retries are deterministic and never compound partial edits from earlier attempts. Partial code for this policy is already on `cycle/feature/define-enforce-restart-policy-for-build`; this cycle finalizes it: pre-build SHA capture, the resume-time reset, self-healing warnings for missing/unreachable SHAs, the test matrix, and the CLAUDE.md documentation paragraph.

## Source Issue
`step-restart-tolerance-audit-build-step-policy` — "Define + enforce restart policy for `build` step (partial code on branch)"

## Scope

### In Scope
- Policy 1 implementation in `src/engine/run-cycle.ts` + `src/engine/branch.ts`: capture `head_sha` on `build` `step.start`, scan log backwards on resume, `git reset --hard` the cycle branch to that SHA before re-invoking the agent, emit a fresh `step.start` with the same `head_sha` so future resumes still find it.
- Self-healing warnings — `build_pre_sha_missing` (older log without `head_sha`) and `build_pre_sha_unreachable` (commit garbage-collected or never pushed) — skip the reset and re-emit `step.start` with current HEAD.
- Tests in `tests/engine/branch.test.ts` and `tests/engine/run-cycle.test.ts` covering `resetCycleBranchTo` guards, `findPriorBuildHeadSha` parsing, fresh-run SHA capture, resume hard-reset, and both warning paths.
- CLAUDE.md "Build-step restart policy" paragraph under the engine architecture section.

### Out of Scope
- Restart-tolerance of the `fix` step (separate child issue).
- Restart-tolerance of prompt-overwrite steps `spec`/`research`/`plan`/`review`/`reflection` — each is idempotent via a single artifact-file overwrite and explicitly NOT reset.
- Policy 2 (continue on top of partial work) — rejected; documented below in Decision.
- `no_branch` workflows — capture and reset paths are skipped entirely.

## Requirements
- `step.start` events for `step.name === "build"` MUST include a `head_sha` field equal to the cycle branch HEAD immediately before the agent runs.
- On a resumed `build` step, the engine MUST scan `.cycle/log.jsonl` backwards for the most recent `step.start { cycle_id, step:"build" }` and, if its `head_sha` is present and reachable, hard-reset the cycle branch to that SHA before invoking the agent.
- `resetCycleBranchTo` MUST refuse to run when HEAD is outside a `cycle/` branch (defensive guard against operator misuse).
- A missing or unreachable prior `head_sha` MUST emit a `step.warning` with `reason: "build_pre_sha_missing"` or `"build_pre_sha_unreachable"`, skip the reset, and still emit a fresh `step.start` carrying the current HEAD as `head_sha` so the next resume self-heals.
- Non-`build` agent steps MUST NOT emit `head_sha` in `step.start` and MUST NOT be reset.
- Coverage must not regress: line ≥ 95%, branch ≥ 75%, function ≥ 90%.

## Acceptance Criteria
- [ ] `src/engine/run-cycle.ts` captures `head_sha` on fresh `build` `step.start`; resume path runs `resetCycleBranchTo(prior)` when reachable.
- [ ] `src/engine/branch.ts:resetCycleBranchTo` throws when HEAD is not on a `cycle/` branch or is unresolvable.
- [ ] `step.warning` emitted with `reason: "build_pre_sha_missing"` when the prior `step.start` lacks `head_sha`.
- [ ] `step.warning` emitted with `reason: "build_pre_sha_unreachable"` when the prior `head_sha` no longer resolves to a commit.
- [ ] Test asserts a resumed `build` step rewinds an in-progress dirty branch back to the captured SHA before re-running the agent.
- [ ] Test asserts non-`build` `step.start` events do NOT carry `head_sha`.
- [ ] CLAUDE.md "Build-step restart policy" paragraph names Policy 1, the warning reasons, and the `no_branch` skip.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes with no warnings.
- [ ] `npm run test:coverage` meets baselines (line ≥ 95%, branch ≥ 75%, func ≥ 90%); report numbers in `BUILD.md`.

## Decision: Policy 1 vs Policy 2

**Chosen: Policy 1 — hard reset to pre-`build` HEAD on resume.**

| | Policy 1 (hard reset) | Policy 2 (continue on partial) |
|---|---|---|
| Determinism | Each retry starts from identical state. | Agent sees a non-deterministic mix of prior partial edits + fresh prompt. |
| Testability | Single observable post-reset state. | Combinatorial explosion of partial-state shapes. |
| Lost work risk | Real but bounded — the agent has not yet committed at the time `build` halts, so no merged history is lost; only unfinished edits are discarded. | None thrown away, but unfinished edits may push the agent into a worse final state than a clean restart. |
| Prompt complexity | Build prompt unchanged. | Prompt must explicitly handle "you may see partial prior output" — extra cognitive load every run, not just on retry. |
| Implementation cost | One SHA in `step.start`, one `git reset --hard` on resume. | Prompt rewrite + agent-side reconciliation logic with no good test oracle. |

Policy 1 wins because (a) `build` is the only mutating step in `feature` and the agent has not committed at the time a halt occurs, so the lost-work surface is narrow; (b) deterministic retries are testable and reasoning-friendly; (c) it costs one extra field on one event.

## Testing Strategy
- Framework: Node's native test runner (`node --test`), spec reporter, exercised via `npm test`.
- `tests/engine/branch.test.ts`:
  - `resetCycleBranchTo` discards staged + unstaged + untracked changes back to the target SHA on a `cycle/` branch.
  - `resetCycleBranchTo` refuses on a non-`cycle/` branch and surfaces the guard error.
  - `resetCycleBranchTo` refuses when HEAD cannot be resolved or cwd is missing.
- `tests/engine/run-cycle.test.ts`:
  - `findPriorBuildHeadSha`: returns `null` when log is missing, returns `"missing"` when prior `build` `step.start` lacks `head_sha`, returns `null` when no `build` `step.start` matches the cycle id.
  - Fresh run: `build` `step.start` carries `head_sha`; `spec` / non-build `step.start` does not.
  - Resume happy path: dirty cycle branch is hard-reset to the prior `head_sha`; a fresh `step.start` re-emits the same `head_sha`.
  - Resume warning paths: `build_pre_sha_missing` and `build_pre_sha_unreachable` each emit their warning, skip the reset, and re-emit `step.start` with current HEAD.
- Coverage: `npm run test:coverage` must report line ≥ 95%, branch ≥ 75%, func ≥ 90%, and must not regress any individual file's number.

No UI surface in this cycle — no Playwright / E2E test required.

## Documentation Updates
- **CLAUDE.md**: extend the engine "Resume from log tail" entry with a `Build-step restart policy` paragraph that names Policy 1, the `head_sha` capture point, the resume reset, both `step.warning` reasons, the `no_branch` skip, and the explicit non-reset of `spec` / `research` / `plan` / `review` / `reflection`. *(Already on branch — verify wording still matches final code.)*
- **README.md**: no user-facing surface changes; no update required.
- **`src/defaults/prompts/build.md`**: no change — Policy 1 means the agent always sees a clean branch, so the existing prompt remains correct without a partial-state caveat.

Documentation is part of "done" — the CLAUDE.md paragraph must land in this cycle's commits.

## Dependencies
- Existing engine modules: `src/engine/run-cycle.ts`, `src/engine/branch.ts`, `src/engine/log.ts`, `src/engine/log-tail.ts`.
- Git available on PATH for child `git reset --hard` / `git rev-parse` calls.
- Node ≥ 22.6 (project-wide requirement).
- No new env vars, no external services.
```
