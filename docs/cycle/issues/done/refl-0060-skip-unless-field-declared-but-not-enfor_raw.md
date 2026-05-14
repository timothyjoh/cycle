---
id: refl-0060-skip-unless-field-declared-but-not-enfor
source: reflection
title: skip-unless-field-declared-but-not-enforced-in-runner
added_at: "2026-05-14T21:59:04.908Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0060"
---

`src/engine/workflow.ts:10` declares an optional `skip_unless?: string` field on the `Step` schema, and `.cycle/workflows.yml` uses it on the `fix` step (`skip_unless: MUST-FIX.md`). But `src/engine/run-cycle.ts` never reads the field, so the runner invokes the fix agent unconditionally — exactly what happened this cycle. FIX.md called this out explicitly under "Reflection-worthy follow-ups" (item 1).

This matters because the fix step's no-op invocation today wasted an agent call and produced a misleading FIX.md artifact. As soon as the codebase ships more conditional steps (e.g. a future `docs` workflow with a `skip_unless: DOC_DRIFT.md`), the same gap will multiply.

Suggested direction: in `runStep` / the step loop in `src/engine/run-cycle.ts`, before invoking the agent for a step, check `if (step.skip_unless) { if (!existsSync(join(artifactDir, step.skip_unless))) { emit step.skipped {reason:"skip_unless_absent", file: step.skip_unless}; continue; } }`. Add one test in `tests/engine/` that pre-stages a workflow with `skip_unless` pointing to a non-existent file and asserts the step emits `step.skipped`, not `step.end status:ok`. Either honor the field or remove it from the schema; the current state is silently broken.
