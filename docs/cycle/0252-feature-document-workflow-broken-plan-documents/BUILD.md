All pass. Coverage: Line 98.75%, Branch 92.63%, Function 93.36% — all above baseline floors (≥95%, ≥75%, ≥90%). All per-file floors met.

## Summary

Created three missing prompt files for the `document` workflow, removed the dead `verify.md` prompt and its broken test fixture, force-synced all changes to `.cycle/prompts/`, and added 18 new test assertions covering the three new prompts.

**Files created**: `src/defaults/prompts/plan_documents.md` (~116 lines), `src/defaults/prompts/authoring.md` (~92 lines), `src/defaults/prompts/review_documents.md` (~111 lines). Each opens with the exact FILE ARTIFACT MODE inline directive on line 1, contains the body from the existing `.cycle/` versions, and appends a `## File Artifact Mode` guardrail section with WRONG/CORRECT examples. `review_documents.md` uses the `# Review: Cycle <cycle_id> — PASS` / `— NEEDS-FIX` verdict title pattern from `review.md`.

**Files deleted**: `src/defaults/prompts/verify.md`, `tests/defaults/verify-prompt-spec-ac.test.ts`, `.cycle/prompts/verify.md`.

**Files modified**: `tests/defaults/file-artifact-mode-guardrail.test.ts` (+108 lines, 18 new tests: 5 FAM content assertions + 1 byte-identity assertion × 3 prompts). `.cycle/prompts/authoring.md`, `.cycle/prompts/plan_documents.md`, `.cycle/prompts/review_documents.md` overwritten by `npm run sync-defaults --force`.

**All PLAN.md tasks complete** (Tasks 1–6). `npm test` ran and passed: 737 tests, 0 failures. `npm run test:coverage` ran; Line 98.75% (≥95%), Branch 92.63% (≥75%), Function 93.36% (≥90%) — no regressions. All per-file coverage floors met.

**Deviation from PLAN.md**: Task 5 required `npm run sync-defaults --force` rather than plain `npm run sync-defaults` because `.cycle/prompts/` already had content for the three new files (recorded in `.sync-state.json` as having been locally modified). The `--force` flag is the documented override for this exact scenario and is safe here since `src/defaults/` is the canonical source of truth.

**No deferred work.** All SPEC acceptance criteria satisfied.

## Touched Files
- src/defaults/prompts/plan_documents.md
- src/defaults/prompts/authoring.md
- src/defaults/prompts/review_documents.md
- src/defaults/prompts/verify.md (deleted)
- tests/defaults/verify-prompt-spec-ac.test.ts (deleted)
- tests/defaults/file-artifact-mode-guardrail.test.ts
- .cycle/prompts/plan_documents.md
- .cycle/prompts/authoring.md
- .cycle/prompts/review_documents.md
- .cycle/prompts/verify.md (deleted)
