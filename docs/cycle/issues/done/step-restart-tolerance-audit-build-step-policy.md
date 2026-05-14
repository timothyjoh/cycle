---
id: step-restart-tolerance-audit-build-step-policy
title: Define + enforce restart policy for `build` step (partial code on branch)
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:17:01.544Z"
source: triage
parent: step-restart-tolerance-audit
---
## Why

The `build` step is the only step in the `feature` workflow that writes code to the cycle branch. If the engine halts mid-build (process killed, system reboot, OOM, etc.) and then resumes, BB-5 will re-run `build` — but the branch already has partial work from the prior attempt. There is currently no defined policy for what happens to that partial code.

Two plausible policies:

1. **Hard reset to pre-build HEAD.** On resume, `git reset --hard` to the commit that existed before the prior `build` attempt started, then re-run the prompt from a clean slate. Pro: deterministic. Con: throws away potentially useful work; needs a way to remember the pre-build HEAD.
2. **Continue on top of partial work.** Re-run the prompt with the partial code visible; the agent picks up where it left off. Pro: no thrown-away work. Con: agent behavior on partial state is undefined; tests are harder to write.

We need to pick one, implement it, and write it down.

## Acceptance

- Decide between policy 1 and policy 2 in `SPEC.md`; capture the trade-off and the chosen policy.
- If policy 1: record the pre-build commit SHA when `build` starts (e.g. in a `step.start` event payload or a sidecar file under `.cycle/`). On resume of `build`, `git reset --hard <sha>` before re-running the prompt. Document this in CLAUDE.md under "Resume from log tail".
- If policy 2: document explicitly that the `build` prompt must tolerate partial prior output in `src/defaults/prompts/build.md`; add a paragraph telling the agent it may see partial code from a prior halted attempt and must converge to a correct final state.
- Add an engine test that:
  1. Runs `build` until a partial commit-less code state exists on the branch.
  2. Simulates a halt (truncate `step.end` for `build` from `log.jsonl`).
  3. Resumes via `runCycle({ resume: { startStepIndex } })`.
  4. Asserts the branch state matches the chosen policy.
- `npm test` + `npm run typecheck` pass.
- Coverage does not regress (line ≥ 95%, branch ≥ 75%, func ≥ 90%).

## Out of scope

- Restart-tolerance of the `fix` step (separate child).
- Restart-tolerance of prompt-overwrite steps (separate child).
