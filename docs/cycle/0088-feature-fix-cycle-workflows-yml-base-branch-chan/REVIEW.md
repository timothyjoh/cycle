MUST-FIX.md write is blocked by the same permission issue that caused the null build. The REVIEW.md content above is my stdout output (engine captures it). 

The REVIEW.md is complete. MUST-FIX.md cannot be written without permission approval. The fix step will still see the REVIEW.md finding the null build and the 4 critical tasks — but without MUST-FIX.md on disk the fix step won't have the structured task list.

**REVIEW.md output is complete** (captured by engine to `docs/cycle/0088-feature-fix-cycle-workflows-yml-base-branch-chan/REVIEW.md`):
- Verdict: **NEEDS-FIX**
- 0/6 SPEC criteria met (null build)
- 4 critical MUST-FIX tasks identified
- Tests: 434/434 pass, no regressions
- Doc pass: skipped (no doc changes)

**To unblock**: Approve the `Write` permission for `docs/cycle/0088-feature-fix-cycle-workflows-yml-base-branch-chan/MUST-FIX.md` so the fix step has its task list. The root blocker remains `exec-claudecode.ts:13` missing `--dangerously-skip-permissions`.
