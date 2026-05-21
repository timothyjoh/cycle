# Must-Fix Items: Cycle 0218

## Summary
1 critical issue found in review.

## Tasks

- [x] ### Task 1: Reconstruct contaminated SPEC.md with proper structure and acceptance criteria
  **Priority:** Critical
  **Files:** `docs/cycle/0218-feature-fix-artifact-contamination-at-invocation/SPEC.md`
  **Problem:** `SPEC.md` contains only a single contaminated confirmation sentence: `"SPEC.md written to \`docs/cycle/0218-feature-fix-artifact-contamination-at-invocation/SPEC.md\`. Scopes Option A..."`. It has no `## Acceptance Criteria` section, no `## Objective`, and no structured content. A missing `## Acceptance Criteria` section is a NEEDS-FIX trigger per review policy.
  **Fix:** Replace the file with a properly structured SPEC.md. Use the derived acceptance bullets from `PLAN.md`'s `## SPEC Acceptance Traceability` table (lines 382–395) as the `## Acceptance Criteria` section. Include at minimum:
  - `## Objective` — one-paragraph summary of what the cycle fixes (suppressing learning-mode contamination at the invocation layer via `--append-system-prompt` and WRONG/CORRECT prompt examples)
  - `## Acceptance Criteria` — one bullet per row in PLAN.md's traceability table, written as testable statements:
    - `appendSystemPrompt?: string` added to `ExecModule.runStep` interface in `src/engine/exec.ts`
    - `claudecodeExec.runStep` prepends `["--append-system-prompt", value]` to argv before `-p` when `appendSystemPrompt` is truthy
    - `ARTIFACT_STEPS` constant defined in `run-cycle.ts` containing the seven artifact step names
    - `run-cycle.ts` passes `appendSystemPrompt: ARTIFACT_SUPPRESS_PROMPT` (or `undefined`) at the `mod.runStep()` call site based on `ARTIFACT_STEPS.has(step.name)`
    - Two argv-assertion tests: flag present when provided, absent when omitted
    - Six prompts (`plan`, `review`, `build`, `research`, `fix`, `documentation`) each gain a WRONG/CORRECT labeled negative example in their FAM section
    - Seven tests asserting `**WRONG**` presence (one per updated prompt) plus `plan.md` trailing-commentary prohibition test
    - Full test suite passes at 647 tests; coverage gates pass; `npm run typecheck` zero errors
  **Verify:** `grep -c "## Acceptance Criteria" docs/cycle/0218-feature-fix-artifact-contamination-at-invocation/SPEC.md` returns `1`; file is > 500 bytes.
  **Status:** ✅ Fixed
  **What was done:** Replaced single contaminated confirmation sentence with properly structured SPEC.md containing `## Objective` (one-paragraph summary of the dual-layer fix) and `## Acceptance Criteria` (11 testable bullets derived from PLAN.md's SPEC Acceptance Traceability table). File is 2053 bytes.
