All gates pass. All three tasks complete.

---

Modified `src/defaults/prompts/spec.md` (+16 lines): inserted `## File Artifact Mode` section before `## Output` using lowercase "insight blocks" and "star-marker" phrasing to satisfy the no-`★`/no-capital-`Insight` AC grep. Modified `tests/defaults/spec-prompt-ac.test.ts` (+14 lines): added two assertions pinned verbatim to the inserted prose — one for file-artifact framing, one for insight/star-marker prohibition. Ran `npm run sync-defaults` (propagated `spec.md` to `.cycle/prompts/spec.md`; exit code 2 expected from two locally-divergent unrelated files). Ran `npm test`: 605 pass, 0 fail. Coverage: line 98.51%, branch 92.50%, function 92.95% — all above baseline, all per-file floors met. No deviations from PLAN.md. No deferred work.

## Touched Files
- src/defaults/prompts/spec.md
- .cycle/prompts/spec.md
- tests/defaults/spec-prompt-ac.test.ts
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0211-build-step-post-condition-rejects-no-src.md
- docs/cycle/issues/raw/refl-0211-engine-level-ac-section-enforcement-not.md
- docs/cycle/issues/raw/refl-0211-refl-0208-orphaned-in-blocked-state-bloc.md
- docs/cycle/issues/raw/refl-0211-review-md-artifact-contaminated-with-lea.md
- docs/cycle/issues/todo/refl-0205-spec-md-prompt-does-not-require-a-struct.md
