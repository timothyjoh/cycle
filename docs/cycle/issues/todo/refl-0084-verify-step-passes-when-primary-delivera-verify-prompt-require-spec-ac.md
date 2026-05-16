---
id: refl-0084-verify-step-passes-when-primary-delivera-verify-prompt-require-spec-ac
title: Update verify prompt to require per-AC targeted verification before passing
workflow: feature
depends_on: []
triaged_at: "2026-05-16T02:12:37.206Z"
source: triage
parent: refl-0084-verify-step-passes-when-primary-delivera
---
## Problem

Cycle 0084's verify bash step exited 0 (`step.end verify status:ok`) even though the expected one-line change to `src/engine/exec-claudecode.ts` was never applied. The verify prompt currently only requires the test suite to pass — a green suite does not prove a specific code change landed.

This is the fifth consecutive cycle where a silent failure in the build/fix step was not caught by verify, because verify never checked whether the SPEC acceptance criteria were concretely satisfied.

## Fix

Update `src/defaults/prompts/verify.md` to add an explicit SPEC Acceptance Criteria verification pass as the **first** verification step, before the test suite run.

The new section must require the agent to:
1. Re-read `SPEC.md` and extract every bullet under `## Acceptance Criteria`.
2. For each bullet, run a targeted, concrete check — a `grep`, `stat`, `node -e`, or equivalent — that confirms the criterion is satisfied at HEAD. Checks must be specific to the criterion (e.g. `grep -q 'dangerously-skip-permissions' src/engine/exec-claudecode.ts || exit 1`).
3. If any check fails or cannot be expressed as a concrete assertion, emit a `MUST-FIX` entry and do **not** declare success.
4. Only after all per-AC checks pass does the agent proceed to the test suite step.

The goal: a passing test suite is necessary but not sufficient. Verify must prove the SPEC deliverable is present.

## Implementation steps

1. Read `src/defaults/prompts/verify.md` to understand current structure.
2. Add `## Step 1: SPEC Acceptance Criteria Verification` before the existing test-suite section, with the requirements above.
3. Renumber/relabel the existing test-suite section as `## Step 2: Test Suite` (or similar) to make the two-step sequence explicit.
4. Run `npm run sync-defaults` to copy to `.cycle/prompts/verify.md`.
5. Confirm both files are byte-identical after sync (use `diff` or `cmp`).
6. Run `npm test` and confirm the suite passes with no regressions.

## Acceptance criteria

- `src/defaults/prompts/verify.md` contains a section requiring per-AC targeted grep/assertion verification before the test-suite step.
- `.cycle/prompts/verify.md` is byte-identical to `src/defaults/prompts/verify.md` after `npm run sync-defaults`.
- `npm test` passes with no regressions.
- Coverage does not drop below the baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
