---
id: refl-0065-extend-step-end-stderr-surface-to-agent
source: reflection
title: extend-step-end-stderr-surface-to-agent-path-failures
added_at: "2026-05-15T18:33:28.859Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0065"
---

Cycle 0065 added a head-capped `stderr` field to failed bash `step.end` events at `src/engine/run-cycle.ts:173-181`, but the conditional gate is `step.agent === "bash" && r.status === "failed"` — failed `claudecode` / `codex` / `gemini` `step.end` events still drop their captured stderr on the floor. BUILD.md (Deferred / follow-up section) and REVIEW.md (Adversarial Test Review observation #2) both explicitly flag this as the same masking pattern. `r.stderr` is already populated on the agent path in three places: `UnknownAgentError` (`src/engine/run-cycle.ts:147`), the spec-guard failure (line 161), and inside each provider module's `runStep` implementation.

Why it matters: when a `claudecode` step fails (the most common failure mode in this engine — e.g. the cycle 0064 spec-step crash visible at `.cycle/log.jsonl` 2026-05-15T18:17:11Z), operators have no audit trail of why. They must re-run the cycle or shell into the agent process to recover the root cause. SPEC scoped agent-path extension out of this cycle deliberately, intending exactly this follow-up.

Suggested direction: relax the gate at `src/engine/run-cycle.ts:178` to `r.status === "failed"` (drop the `step.agent === "bash"` predicate) and use the same `truncateStepEndStderr` helper. Add agent-path regression tests mirroring the three bash-path tests in `tests/engine/run-cycle.step-end-stderr.test.ts`. Update CLAUDE.md `Architecture quick reference` to remove the bash-only carve-out from the existing bullet.
