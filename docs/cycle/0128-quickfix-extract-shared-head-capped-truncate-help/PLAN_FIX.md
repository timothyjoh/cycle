Awaiting permission to write the PLAN.md — please approve the write to `docs/cycle/0128-quickfix-extract-shared-head-capped-truncate-help/PLAN.md`.

Here's a preview of what it contains:

**Fix (5 steps):**
1. New `src/engine/log-fmt.ts` — export `truncateHeadCapped(s, max)`
2. `run-cycle.ts:50-51` — delete `truncateStepEndStderr`, import helper, update call at :245
3. `triage.ts:241-243` — delete local `truncate`+`MAX_ERR_LEN`, import helper, update call at :247
4. Test file `:9,225-243` — swap import from `truncateStepEndStderr` → `truncateHeadCapped`, update 3 unit tests
5. `CLAUDE.md` — add one-liner for `log-fmt.ts` (no "intentional duplicate" notes found to remove — were never written)

**Test:** Add `max+1` boundary case (`"a".repeat(2001)` → length 2000, ends `…`); update existing 3 unit tests to call the new helper directly.
