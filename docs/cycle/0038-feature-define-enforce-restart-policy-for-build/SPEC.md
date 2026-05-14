# SPEC — Cycle 0038: Restart policy for `build` step

## Objective

Define and enforce a deterministic restart policy for the `build` step. Today, if the engine halts after `build` has dirtied the cycle branch (uncommitted writes from the agent) and is later resumed, BB-5 re-runs `build` on top of that partial state with no policy and no guarantee of convergence. This cycle picks the **hard-reset** policy, captures the pre-build commit SHA when `build` starts, and resets the branch back to that SHA on resume before re-running the prompt. End-to-end behavior: a caller who interrupts an engine mid-`build` and re-invokes `cycle` gets a deterministic clean-slate retry instead of an undefined "continue on partial output" pass.

## Source Issue

`step-restart-tolerance-audit-build-step-policy` — "Define + enforce restart policy for `build` step (partial code on branch)"

## Policy Decision

**Policy 1: Hard reset to pre-build HEAD.** Chosen.

Trade-off (recorded for future readers):

- **Policy 1 (hard reset, chosen).** Deterministic. The `build` prompt always runs against the exact base state planted by `plan/research/spec`. Cost: one extra `git rev-parse HEAD` at `step.start` for `build`, one `git reset --hard <sha>` on resume, and one new field in the `step.start` event payload. Any partial work the agent left behind is thrown away — but that work was already non-committed and non-reviewed, so its expected value is low. Pairs naturally with the existing engine discipline: failed steps re-run from a clean state; tbd-rows mutate atomically; commit step short-circuits with `git diff --cached --quiet`.
- **Policy 2 (continue on partial work, rejected).** Would require teaching the `build` prompt to detect, reason about, and converge from arbitrary partial output. Agent behavior in that regime is empirically inconsistent (see refl-0029 `fix-step-produced-empty-fix-md-despite-...`). Tests would need to fabricate plausible-but-incomplete intermediate states, which is brittle. Reuses no existing mechanism.

The decision is "throw away partial agent edits on resume" — the agent has not yet committed its work, so no merged history is lost.

## Scope

### In Scope

- Record `head_sha` in the `step.start` event payload for the `build` step only, captured via `git rev-parse HEAD` immediately before invoking the agent.
- On resume, when `resume.startStepIndex` points at the `build` step, look up the matching prior `step.start` for `build` in `.cycle/log.jsonl`, read its `head_sha`, and `git reset --hard <sha>` before running the step.
- Document the policy in `CLAUDE.md` under "Resume from log tail".

### Out of Scope

- Restart-tolerance of the `fix` step (separate child: `step-restart-tolerance-audit-fix-step-policy`).
- Restart-tolerance of prompt-overwrite steps (`spec`, `research`, `plan`, `review`, `reflection`).
- Restart-tolerance of `pr`, `commit`, `verify` (already covered or out of audit scope).
- Generalizing the head-sha capture to all agent steps. Only `build` writes code; the others overwrite a single artifact file.
- Capturing pre-build SHA in a sidecar `.cycle/` file. The log is already the durable source of truth — adding a second one creates a consistency hazard.

## Requirements

- **Functional 1.** When `build` is about to run on a fresh (non-resume) invocation, the engine emits `step.start { step: "build", head_sha: <sha> }` where `<sha>` is the current `HEAD` of the cycle branch.
- **Functional 2.** When `runCycle({ resume: { startStepIndex } })` is invoked and `wf.steps[startStepIndex].name === "build"`, the engine reads the most recent `step.start` event for `build` belonging to the same `cycle_id` from `.cycle/log.jsonl`, extracts its `head_sha`, and runs `git reset --hard <sha>` on the cycle branch before invoking the agent. If the prior event is missing or has no `head_sha`, emit `step.warning { reason: "build_pre_sha_missing" }` and proceed without reset (forward-compatibility — older logs predate this field).
- **Functional 3.** A new `step.start` event MUST be emitted for the resumed `build` step (with a fresh `head_sha` that equals the pre-reset SHA), so the next resume after another halt still finds a valid pre-build SHA. This keeps the resume rule a single backward-scan instead of "find the oldest matching `build` start in the cycle."
- **Non-functional.** No new shell invocations (`exec`/`shell:true`); reuse the existing `spawn`-with-array pattern in `src/engine/branch.ts`. Encapsulate the reset behind a named helper (`resetCycleBranchTo(sha)` in `branch.ts`).
- **Non-functional.** The reset MUST run inside the cycle branch (not on `master`); the engine already checks out the cycle branch in `checkoutCycleBranch` before resume, so resetting after that call is correct. Add an assertion (current branch starts with `cycle/`) to fail loud if the invariant ever breaks.

## Acceptance Criteria

- [ ] `runCycle` records `head_sha` on `step.start` for the `build` step (and only for `build`).
- [ ] On resume at the `build` step, the engine reads the prior `step.start.head_sha` and runs `git reset --hard <sha>` before invoking the agent.
- [ ] If the prior `head_sha` is absent (old log), the engine emits a structured warning event and skips the reset; the cycle still proceeds.
- [ ] A new engine test (`tests/engine/build-restart.test.ts` or extension of an existing resume test) covers the full halt-and-resume loop: (a) seed a cycle branch + log with a completed `plan` step + a dangling `build` step.start with `head_sha = X`; (b) dirty the working tree with a fake "partial build" file at HEAD = X+Y; (c) call `runCycle({ resume: { startStepIndex: <build_index> }})`; (d) assert HEAD is back at X, the dirty file is gone, and a fresh `step.start` for `build` was emitted with `head_sha: X`.
- [ ] A second test covers the "older log without head_sha" path and asserts the warning event is emitted.
- [ ] `CLAUDE.md` "Resume from log tail" subsection documents: the `head_sha` field on `step.start`, the hard-reset behavior on resume of `build`, and the explicit non-policy for other agent steps (they overwrite a single artifact and need no reset).
- [ ] `npm test` and `npm run typecheck` pass.
- [ ] `npm run test:coverage`: line ≥ 95%, branch ≥ 75%, function ≥ 90%. Per-file coverage of `src/engine/branch.ts` and `src/engine/run-cycle.ts` does not regress.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy

- Node's native test runner (`node --test`), spec reporter — same as the rest of the suite.
- **Happy path test.** Build a fixture repo via the existing test helpers (`tests/helpers/repo.ts` or similar — pattern from existing resume tests under `tests/engine/`). Seed `.cycle/log.jsonl` with synthetic events: `cycle.start`, `step.start/step.end` pairs for `spec/research/plan` (all `status:ok`), and a single `step.start` for `build` with a `head_sha` pointing at a commit SHA recorded earlier in the fixture. Add an untracked "partial build artifact" file to the working tree and an extra unrelated commit on the cycle branch. Then call `runCycle` with `resume.startStepIndex` set to the `build` index and a stub agent that records its observed working-tree state and returns `status:failed` (so the test does not need a real `claudecode`). Assert: HEAD matches the pre-build SHA, the partial file is gone, the stub agent saw the clean tree, and exactly one new `step.start` for `build` was logged with `head_sha` equal to the pre-build SHA.
- **Backward-compat test.** Same setup, but the seeded `step.start` for `build` has no `head_sha`. Assert: `step.warning {reason:"build_pre_sha_missing"}` is emitted, no `git reset` is run, the agent stub still runs.
- **Regression coverage.** The non-resume code path: confirm `step.start` for `build` on a fresh cycle now includes `head_sha`, and that `step.start` for other agent steps does *not* include it (avoid noisy log payloads).
- No E2E / UI tests — this is an engine-internal change.

## Documentation Updates

- **`CLAUDE.md`** — extend the "Resume from log tail" paragraph under "Architecture quick reference" with:
  - The `head_sha` field on `step.start` for `build`.
  - The hard-reset behavior on resume of `build`, and why (Policy 1 trade-off, one-sentence summary).
  - Explicit note that other agent steps are not reset (they overwrite a single artifact file via the existing engine writeFile, which is already idempotent).
- **`README.md`** — no user-facing surface change; no update needed.
- **`docs/ARCHITECTURE.md`** — add a one-line bullet under the "Resume semantics" section (or wherever resume is described) cross-referencing CLAUDE.md.

Docs are part of "done"; the build step will be flagged incomplete if these are missing.

## Dependencies

- Existing `checkoutCycleBranch` in `src/engine/branch.ts`.
- Existing `parseLogTail` in `src/engine/log-tail.ts` — may need a small extension to expose the prior `build` `step.start` payload, or the new logic can do its own backward scan in `run-cycle.ts`. Implementation decides during PLAN; both are fine.
- `git` on PATH (already assumed everywhere in the engine).
- No new env vars, no new external services.
