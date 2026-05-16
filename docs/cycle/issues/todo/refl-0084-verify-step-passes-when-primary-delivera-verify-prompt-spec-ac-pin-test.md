---
id: refl-0084-verify-step-passes-when-primary-delivera-verify-prompt-spec-ac-pin-test
title: Pin verify prompt SPEC-AC requirement with regression test
workflow: feature
depends_on: [refl-0084-verify-step-passes-when-primary-delivera-verify-prompt-require-spec-ac]
triaged_at: "2026-05-16T02:12:37.206Z"
source: triage
parent: refl-0084-verify-step-passes-when-primary-delivera
---
## Problem

After adding the SPEC Acceptance Criteria verification requirement to `src/defaults/prompts/verify.md`, there is no automated guard preventing a future edit from silently removing or weakening it. The review and plan prompts have this protection via `tests/defaults/review-prompt-doc-claim-pass.test.ts` and `tests/defaults/plan-prompt-spec-traceability.test.ts`; verify.md should too.

## Fix

Add `tests/defaults/verify-prompt-spec-ac.test.ts` that:
1. Reads `src/defaults/prompts/verify.md` as a UTF-8 string.
2. Asserts that the SPEC-AC verification requirement is present — e.g. checks for a phrase like `Acceptance Criteria` combined with a concrete assertion/grep requirement. Mirror the assertion style from `tests/defaults/plan-prompt-spec-traceability.test.ts`.
3. Reads `.cycle/prompts/verify.md` and asserts byte-equality with `src/defaults/prompts/verify.md`, ensuring `sync-defaults` was run after the prompt edit.

## Implementation steps

1. Read `tests/defaults/plan-prompt-spec-traceability.test.ts` for the exact test shape (Node native test runner, `node:assert/strict`, `node:fs`).
2. Create `tests/defaults/verify-prompt-spec-ac.test.ts` with two test cases:
   - `'verify prompt requires per-AC targeted verification'`: reads `src/defaults/prompts/verify.md`, asserts the key requirement phrase is present.
   - `'verify prompt src/defaults and .cycle copies are byte-identical'`: reads both files, asserts `===`.
3. Run `npm test` and confirm both new test cases pass alongside the full suite.

## Acceptance criteria

- `tests/defaults/verify-prompt-spec-ac.test.ts` exists and both test cases pass.
- The SPEC-AC requirement phrase assertion is specific enough to catch removal of the requirement (not just a generic `includes('verify')` check).
- Byte-equality test catches any drift between `src/defaults/prompts/verify.md` and `.cycle/prompts/verify.md`.
- `npm test` passes with no regressions and coverage does not drop below baseline.
