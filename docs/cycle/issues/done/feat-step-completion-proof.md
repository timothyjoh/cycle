---
id: feat-step-completion-proof
title: "Per-step completion-proof contract: a step that exits 0 but produced nothing must fail"
workflow: feature
depends_on: []
triaged_at: "2026-05-31T01:50:00.000Z"
source: user
priority: high
---
## Problem

A step can exit 0 while having done nothing useful, and the engine treats it as
success. Observed this session:
- the `review` step exited 0 but wrote a **0-byte `REVIEW.md`** (also tracked as
  `refl-0253`); downstream steps consumed an empty artifact.
- a `build` step **hung ~60 min** and would have looked "successful" if it ever
  returned, because exit-0 + artifact-present is the only success signal.

Exit code + artifact-existence is too weak a completion signal. (Borrowed from
the a5c-ai/babysitter "completion-proof / promise-tag" idea: a step's loop only
ends when the agent emits a verifiable proof that the intended work is done.)

## Task

Add a **per-step completion-proof contract** to `src/engine/run-cycle.ts`,
generalizing the existing one-off `MUST-FIX.md`/`REVIEW.md` guards into a single
post-condition checked after every agent step:

1. For steps that declare an output artifact (spec→SPEC.md, plan→PLAN.md,
   review→REVIEW.md, build→BUILD.md, etc.), after the step exits 0, stat the
   artifact: **missing or 0-bytes (or whitespace-only) → fail the step** with a
   descriptive error (`"<step> exited 0 but <artifact> is empty — treating as
   failure"`). This subsumes `refl-0253`.
2. Make the step→artifact mapping a single declarative table (so it composes
   with the existing `ARTIFACT_STEPS` set rather than scattering guards).
3. Emit a `step.completion_check { step, artifact, status }` event so the
   outcome is visible in the log.
4. A failed completion check counts as a normal step failure (feeds the retry /
   `max_cycle_attempts` machinery) — not a silent pass.

Out of scope (separate issues): hung-step *timeout* (the engine never regains
control), and capturing bash-step stdout. This issue is only about the
exit-0-but-empty class for agent steps.

## Acceptance criteria

- [ ] A declarative step→artifact table drives a post-step non-empty check after every agent step that declares an artifact.
- [ ] review/spec/plan/build empty-artifact (0-byte or whitespace-only) on exit 0 → step fails with the descriptive error; subsumes and closes `refl-0253`.
- [ ] `step.completion_check` event emitted with the outcome.
- [ ] Failure routes through normal retry (does not silently pass).
- [ ] Tests cover: empty artifact → fail; non-empty artifact → pass; step with no declared artifact → unaffected.
- [ ] `npm run typecheck` clean; `npm test` passes; coverage floors hold (`run-cycle.ts` ≥ 90%).

## Notes

- Source: babysitter gap-analysis (2026-05-30/31). The "promise tag" variant
  (agent emits an explicit completion token) is a stronger future form; the
  non-empty-artifact contract is the pragmatic first step that fixes the
  failures actually observed.
