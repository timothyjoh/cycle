---
id: refl-0214-file-artifact-mode-guardrail-absent-from
title: Add File Artifact Mode guardrail to build, research, fix, and documentation prompts
workflow: feature
depends_on: []
triaged_at: "2026-05-21T09:03:20.834Z"
source: triage
---
## Problem

The File Artifact Mode guardrail has been added to `spec.md` (cycle 0212), `plan.md` (cycle 0213), and `review.md` (cycle 0214), but four artifact-producing prompts remain unguarded:

- `src/defaults/prompts/build.md` → produces `BUILD.md`
- `src/defaults/prompts/research.md` → produces `RESEARCH.md`
- `src/defaults/prompts/fix.md` → produces `FIX.md`
- `src/defaults/prompts/documentation.md` → produces `ENGINE.md` and related docs

Evidence of active contamination: the cycle 0214 `FIX.md` opened with `"**Fix complete.**"` — a learning-mode confirmation phrase. The contamination vector is identical across all four prompts.

## Implementation

### Step 1: Add File Artifact Mode section to each prompt

Mirror the guardrail section already present in `spec.md`, `plan.md`, and `review.md`. Read one of those files first to copy the exact wording and placement, then add the same section to each of the four target prompt files.

For each prompt, the section must instruct the agent to:
- Output the artifact body directly with no preamble, confirmation language, or trailing commentary
- Never wrap output in markdown code fences
- Never open with phrases like "Here is", "Fix complete", "I've updated", or similar
- Never append explanations or summaries after the artifact content

### Step 2: Sync defaults

After editing all four `src/defaults/prompts/` files:

```
npm run sync-defaults
```

### Step 3: Add test coverage

Add test assertions (mirroring existing guardrail tests for spec/plan/review) verifying that each of the four prompt files contains the File Artifact Mode section. Check `tests/` for existing guardrail tests to match the pattern.

### Step 4: Run full test suite

```
npm test
npm run test:coverage
```

All 611+ tests must pass. Coverage gates must not regress.

## Acceptance Criteria

- `src/defaults/prompts/build.md` contains a File Artifact Mode section with no-narration instructions
- `src/defaults/prompts/research.md` contains a File Artifact Mode section with no-narration instructions
- `src/defaults/prompts/fix.md` contains a File Artifact Mode section with no-narration instructions
- `src/defaults/prompts/documentation.md` contains a File Artifact Mode section with no-narration instructions
- `.cycle/prompts/build.md`, `research.md`, `fix.md`, `documentation.md` updated via `sync-defaults`
- Tests assert File Artifact Mode section presence in all four prompt files
- Full test suite passes with no coverage regressions
- `FIX.md` produced by this cycle contains no confirmation language or trailing commentary
