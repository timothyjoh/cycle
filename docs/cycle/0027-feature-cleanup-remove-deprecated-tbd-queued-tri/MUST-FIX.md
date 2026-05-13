# Must-Fix Items: Cycle 0027

## Summary
0 critical, 1 minor issue found in review. SPEC acceptance criteria are
substantively met (working tree matches SPEC, gates green, code path
preserved); the only defect is documentation drift in BUILD.md's
acceptance-grep table.

## Tasks

- [x] ### Task 1: Correct BUILD.md acceptance-grep bucket totals
  **Status:** ✅ Fixed
  **What was done:** Re-ran the live grep at fix time. Actual Σ = 63
  (not 62 as MUST-FIX projected). The +1 over MUST-FIX's table is the
  cycle-0027 REVIEW.md, which the reviewer wrote during the review
  step itself and therefore wasn't visible when MUST-FIX was drafted.
  Bucket c is now 47 (0005×5, 0009×9, 0010×1, 0012×22, 0013×2,
  0019×4, 0027×4 [SPEC=3 + REVIEW=1]); buckets a=0, b=9, d=7;
  Σ = 9 + 47 + 7 = 63 matches `wc -l`. Updated BUILD.md's bucket
  table and the inline narrative on line 48 to read "actual is 63 —
  the 4-hit drop is the cycle-0026 artifact dir stashed in Task 2
  (−5) offset by the cycle-0027 REVIEW.md added by the review step
  (+1)". Kept bucket a's backtick-boundary clarifying note intact.
  **Priority:** Minor
  **Files:** `docs/cycle/0027-feature-cleanup-remove-deprecated-tbd-queued-tri/BUILD.md`
  **Problem:** BUILD.md (lines 22–30) claims `docs/` grep total is 67 hits
  with bucket c = 51 (enumerated as `0005×5, 0009×9, 0010×1, 0012×22,
  0013×2, 0019×4, 0026×5, 0027×3`). The live grep on the working tree
  after Task 2's debris quarantine returns **62 hits**, with bucket c =
  **46** (no `docs/cycle/0026-…/` dir present — it was stashed in Task 2).
  This violates PLAN Task 3's explicit success criterion *"Σ matches the
  live `wc -l` output"*. The bucket categorisation itself is correct;
  only the counts are stale because the table was copied forward from
  cycle 0026's BUILD.md without re-running the grep after the stash.

  Verified per-file counts from the post-stash tree:

  | File group                                               | Hits |
  |----------------------------------------------------------|------|
  | `docs/DOGFOOD.md`                                        | 1    |
  | `docs/plans/2026-05-12-cycle-mvp-dogfood.md`             | 8    |
  | `docs/cycle/0005-…/{SPEC,PLAN,RESEARCH}.md`              | 5    |
  | `docs/cycle/0009-…/{SPEC,PLAN,RESEARCH,BUILD}.md`        | 9    |
  | `docs/cycle/0010-…/RESEARCH.md`                          | 1    |
  | `docs/cycle/0012-…/{SPEC,PLAN,RESEARCH,MUST-FIX}.md`     | 22   |
  | `docs/cycle/0013-…/PLAN.md`                              | 2    |
  | `docs/cycle/0019-…/{SPEC,PLAN,REVIEW}.md`                | 4    |
  | `docs/cycle/0027-…/SPEC.md`                              | 3    |
  | `docs/cycle/issues/done/{cli-drop…, migration-cleanup_raw, …bb-1}.md` | 4 |
  | `docs/cycle/issues/todo/migration-cleanup.md`            | 3    |
  | **Σ**                                                    | **62** |

  **Fix:** Rewrite the BUILD.md "Acceptance grep — bucketed" section so
  Σ = 62, bucket b = 9, bucket c = 46 (drop the `0026×5` term, leaving
  `0005×5, 0009×9, 0010×1, 0012×22, 0013×2, 0019×4, 0027×3`), bucket d =
  7, bucket a = 0. Update the inline narrative "PLAN expected ~67 hits;
  actual is exactly 67" (line 48) to read "PLAN expected ~67 hits; actual
  is 62 — the 5-hit drop matches the cycle-0026 artifact dir stashed in
  Task 2". Keep the bucket-a clarifying note about RFC-001's backtick-
  prefixed annotations not matching the regex boundary.

  **Verify:** Run `rg -n '(^|/)(tbd|queued|triaged)/' docs | wc -l` —
  expect `62`. Run the per-file count `rg -c '(^|/)(tbd|queued|triaged)/'
  docs | sort -t: -k2 -nr` and confirm every line maps to exactly one
  bucket as tabulated above. BUILD.md's new Σ must equal the `wc -l`
  output exactly.

## Observations Not Requiring Fix (informational)

- **Cycle 0026 artifact dir lives in `git stash`.** Per PLAN Task 2 the
  `docs/cycle/0026-feature-…/` dir was stashed alongside cycle-0025
  reflection debris. The stash entry (`stash@{0}:
  cycle-0027-debris-quarantine`) is fragile — a `git stash clear` or
  reflog expiry (~14 days) would destroy that history. BUILD.md's
  "Post-cycle restoration" block documents the manual `git stash pop`
  step, but the cycle 0026 artifact dir is repo history (its SPEC,
  RESEARCH, PLAN, BUILD, REVIEW, FIX, VERIFY documents the failed-commit
  cycle that triggered this retry), not "debris" in the same sense as
  cycle-0025's untracked reflection raws. If the operator forgets to
  `git stash pop` and the stash later expires, that history is lost.
  This is a planner decision (bundling the 0026 dir with cycle-0025
  debris) and falls outside SPEC; no action required for cycle 0027 to
  ship, but the operator running the commit/PR should explicitly handle
  the stashed 0026 dir as a follow-up (commit it separately or migrate
  the contents into 0027's artifact dir).

- **Coverage held at baseline.** `npm run test:coverage` reports line
  97.14% / branch 90.64% / function 96.21% — identical to the cycle-0026
  baseline. Per-file: `src/engine/queue.ts` 96.05% line / 86.90% branch
  / 100% function (no regression from the artifact deletion). No new
  code, no new tests required per SPEC.

- **Engine review-step timing.** HEAD is still at master (`b6662c3`); no
  cycle-0027 commit exists yet. Review runs against the dirty working
  tree before `commit`, so `git diff master...HEAD` is empty and the
  reviewable surface is the staged delete + three unstaged modifications
  + the untracked `0027-…/` artifact dir. This is normal cycle-engine
  ordering, not a defect.
