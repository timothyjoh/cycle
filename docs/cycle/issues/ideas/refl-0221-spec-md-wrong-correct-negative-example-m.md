---
id: refl-0221-spec-md-wrong-correct-negative-example-m
title: Add WRONG/CORRECT negative example to spec.md File Artifact Mode section
workflow: feature
depends_on: [refl-0217-spec-md-negative-example-hardcodes-cycle]
triaged_at: "2026-05-21T11:57:34.536Z"
source: triage
---
## Problem

`src/defaults/prompts/spec.md` is missing a WRONG/CORRECT negative example in its `## File Artifact Mode` section. All six other artifact templates (build, fix, research, documentation, review, plan) already include this paired counterexample pattern. The gap was explicitly deferred in cycles 0218, 0219, and 0221 as out of scope for the active fix at the time — it is now three cycles old.

Without a concrete WRONG example, the spec step agent has weaker signal for recognizing contaminated output. A positive instruction paired with a negative counterexample is more effective than either alone.

## Work

1. Open `src/defaults/prompts/spec.md` and locate the `## File Artifact Mode` section.
2. Add a WRONG/CORRECT negative example block. Model it after the pattern already present in the other six artifact templates — show narration/explanation prose as WRONG, and clean spec content as CORRECT.
3. Run `npm run sync-defaults` to propagate the change from `src/defaults/` to `.cycle/`.
4. Run `npm test` to confirm no regressions.

## Acceptance Criteria

- [ ] `src/defaults/prompts/spec.md` `## File Artifact Mode` section contains a WRONG/CORRECT negative example that mirrors the pattern used in the other six artifact templates.
- [ ] `npm run sync-defaults` executed; `.cycle/prompts/spec.md` updated to match `src/defaults/prompts/spec.md`.
- [ ] `npm test` passes with no regressions.
- [ ] Coverage floors met per `npm run check:coverage`.

## Notes

This task depends on `refl-0217-spec-md-negative-example-hardcodes-cycle`, which replaces a hardcoded cycle-0217 path in spec.md's existing negative example. Sequencing after that fix avoids a merge conflict on the same file. The two changes touch adjacent but distinct sections — no deeper coordination needed beyond ordering.
