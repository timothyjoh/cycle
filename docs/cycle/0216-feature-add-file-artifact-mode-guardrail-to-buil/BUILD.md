632 tests pass (20 new), all coverage gates met. Line 98.51%, Branch 92.50%, Function 92.95% — all above floors.

Modified `src/defaults/prompts/build.md` (from 89→107 lines), `src/defaults/prompts/research.md` (from 82→100 lines), `src/defaults/prompts/fix.md` (from 72→90 lines), `src/defaults/prompts/documentation.md` (from 96→114 lines) — each gained an 18-line `## File Artifact Mode` guardrail section. Synced all four to `.cycle/prompts/` (byte-identical confirmed). Created `tests/defaults/file-artifact-mode-guardrail.test.ts` (119 lines, 20 tests: 4 phrase-presence + 1 dogfood per prompt). All 7 PLAN.md tasks complete. Ran `npm run test:coverage`: 632 tests pass, 0 failures. Coverage: Line 98.51% (≥95% floor), Branch 92.50% (≥75% floor), Function 92.95% (≥90% floor). All per-file floors met. `check:invariants` exits 0. No deviations from PLAN.md. The `sync-defaults` script exited 2 (not 0) due to two pre-existing locally-divergent files (`reflection.md`, `scripts/verify.sh`) that are outside this cycle's scope — the four target prompts synced cleanly and diff to identical. No deferred work.

## Touched Files
- src/defaults/prompts/build.md
- src/defaults/prompts/research.md
- src/defaults/prompts/fix.md
- src/defaults/prompts/documentation.md
- .cycle/prompts/build.md
- .cycle/prompts/research.md
- .cycle/prompts/fix.md
- .cycle/prompts/documentation.md
- tests/defaults/file-artifact-mode-guardrail.test.ts
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0214-file-artifact-mode-guardrail-absent-from.md
- docs/cycle/issues/raw/refl-0214-review-prompt-tests-missing-trailing-com.md
- docs/cycle/issues/raw/refl-0214-spec-md-contamination-recurs-across-thre.md
- docs/cycle/issues/todo/refl-0211-review-md-artifact-contaminated-with-lea.md
- tests/defaults/review-prompt-spec-ac.test.ts
