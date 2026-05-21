## Problem

Cycle 0218 introduced `ARTIFACT_SUPPRESS_PROMPT` passed via `--append-system-prompt` to suppress learning-mode narration in artifact-writing steps. Cycle 0219 ran with this fix in place and SPEC.md was still contaminated. Root cause: `--append-system-prompt` appends to system prompt context but cannot override stronger session-hook injections (`SessionStart` injects `CAVEMAN MODE ACTIVE` and learning-mode setup). The suppression instruction competes with existing session context rather than replacing it. The fix must operate at the user-turn level, inside each prompt template itself.

## Acceptance Criteria

- `FILE ARTIFACT MODE` directive present in all seven artifact prompt templates under `src/defaults/`
- After `npm run sync-defaults`, directive is also present in the corresponding `.cycle/prompts/` copies
- Existing WRONG/CORRECT negative examples remain intact and are not disrupted by the new directive placement
- `npm test` passes, `npm run typecheck` passes, coverage gates satisfied
- A prompt-content assertion test verifies the directive is present in each of the seven template files (analogous to the existing WRONG/CORRECT assertion tests added in cycle 0218)

## Out of Scope

- Adding WRONG/CORRECT examples to `spec.md` — deferred; not part of this cycle
