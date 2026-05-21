---
id: refl-0219-append-system-prompt-suppression-still-i
title: Supplement --append-system-prompt suppression with in-prompt FILE ARTIFACT MODE directive in all artifact templates
workflow: feature
depends_on: []
triaged_at: "2026-05-21T11:12:19.442Z"
source: triage
---
## Problem

Cycle 0218 introduced `ARTIFACT_SUPPRESS_PROMPT` passed via `--append-system-prompt` to suppress learning-mode narration in artifact-writing steps. Cycle 0219 ran with this fix in place and SPEC.md was still contaminated (`"SPEC.md written for cycle 0219..."` narration present). The review flagged it as the same pattern cycles 0214–0218 were fighting.

Root cause hypothesis: `--append-system-prompt` appends to system prompt context but cannot override the stronger session-hook injections (`SessionStart` injects `CAVEMAN MODE ACTIVE` and learning-mode setup). The suppression instruction competes with existing session context rather than replacing it.

## Fix

Add a `FILE ARTIFACT MODE` directive **directly inside each artifact prompt template** as a user-turn-level instruction. This is belt-and-suspenders alongside the existing `--append-system-prompt` mechanism, ensuring suppression is present regardless of system prompt ordering or session hook strength.

Templates to update (all under `src/defaults/prompts/`):
- `spec.md`
- `plan.md`
- `build.md`
- `review.md`
- `research.md`
- `fix.md`
- `documentation.md` (if present)

Directive to prepend or append in each template (exact placement TBD — top of file or immediately before the output instructions section):

```
FILE ARTIFACT MODE: Output only the document contents requested. No narration, no progress commentary, no statements about what you wrote or why. The response IS the file.
```

The directive should be placed where it has the strongest influence — typically at the start of the prompt or immediately before the output section header.

## Acceptance Criteria

- `FILE ARTIFACT MODE` directive present in all six artifact prompt templates under `src/defaults/`
- After `npm run sync-defaults`, directive is also present in the corresponding `.cycle/prompts/` copies
- Existing WRONG/CORRECT negative examples remain intact and are not disrupted by the new directive placement
- `npm test` passes, `npm run typecheck` passes, coverage gates satisfied
- A prompt-content assertion test verifies the directive is present in each of the six template files (analogous to the existing WRONG/CORRECT assertion tests added in cycle 0218)

## Implementation Notes

- The `ARTIFACT_STEPS` constant in `run-cycle.ts` identifies which steps receive `--append-system-prompt`; the same set of steps maps to the template files to update
- Do not remove the `--append-system-prompt` injection — keep both mechanisms active
- If `documentation.md` is not in `ARTIFACT_STEPS`, skip it
- Run `npm run sync-defaults` after editing templates to keep `.cycle/` in sync
