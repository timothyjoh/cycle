# Spec: Add File Artifact Mode guardrail to build, research, fix, and documentation prompts

## Problem

`src/defaults/prompts/build.md`, `research.md`, `fix.md`, and `documentation.md` produce
agent-written artifacts (BUILD.md, RESEARCH.md, FIX.md, ENGINE.md) but carry no
`## File Artifact Mode` guardrail. Without the guardrail, agents running these steps can
emit insight blocks, confirmation sentences, and trailing commentary that contaminate the
artifact files — the same contamination class that prompted guardrail additions to
`spec.md` (cycle 0212), `plan.md` (cycle 0213), and `review.md` (cycle 0214).

Evidence of active contamination: cycle 0214's `FIX.md` opened with `"**Fix complete.**"`.

## Implementation

Add the standard `## File Artifact Mode` section to each of the four remaining
artifact-producing prompts, immediately before their output section. After editing all
four `src/defaults/prompts/` files, run `npm run sync-defaults` to propagate changes to
`.cycle/prompts/`. Add test assertions (mirroring existing guardrail tests for
spec/plan/review) verifying each prompt contains the guardrail section.

## Acceptance Criteria

- `src/defaults/prompts/build.md` contains a File Artifact Mode section with no-narration instructions
- `src/defaults/prompts/research.md` contains a File Artifact Mode section with no-narration instructions
- `src/defaults/prompts/fix.md` contains a File Artifact Mode section with no-narration instructions
- `src/defaults/prompts/documentation.md` contains a File Artifact Mode section with no-narration instructions
- `.cycle/prompts/build.md`, `research.md`, `fix.md`, `documentation.md` updated via `sync-defaults`
- Tests assert File Artifact Mode section presence in all four prompt files
- Full test suite passes with no coverage regressions
- `FIX.md` produced by this cycle contains no confirmation language or trailing commentary
