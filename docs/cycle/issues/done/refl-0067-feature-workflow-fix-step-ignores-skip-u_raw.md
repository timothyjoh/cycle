---
id: refl-0067-feature-workflow-fix-step-ignores-skip-u
source: reflection
title: feature-workflow-fix-step-ignores-skip-unless-must-fix-gate
added_at: "2026-05-15T19:16:04.021Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0067"
---

`FIX.md` for cycle 0067 self-documents the issue: 'feature.yaml step config (`skip_unless: MUST-FIX.md`) should have skipped this step; either the gate fired anyway or the engine invoked it explicitly.' REVIEW.md ended with PASS and no MUST-FIX.md was written, yet `step.start cycle_id:0067 step:fix agent:claudecode` still fires in `.cycle/log.jsonl` and runs for ~27 s of agent time. Either the workflow YAML has no `skip_unless` clause (and BUILD/FIX prompts assume one that isn't wired), or the engine's run-cycle.ts doesn't honor it.

This matters because every clean review cycle burns an extra agent invocation producing a no-op `FIX.md`, and the divergence between prompt expectation and engine behavior will confuse future workflow authors. Suggested direction: grep `src/defaults/workflows.yml` (and the dogfood `.cycle/workflows.yml`) for `skip_unless`, then trace through `src/engine/run-cycle.ts` to see whether the field is read or silently ignored. If unwired, decide whether to honor it or remove the comment from FIX prompts.
