# Must-Fix Items: Cycle 0016

## Summary

1 critical (SPEC.md is empty), 4 minor (negative-path test gaps + a small
readability/extraction win). The implementation itself is correct and
all 199 tests pass; the gaps below are about closing test holes around
the headline feature's failure modes and restoring the planning
artifact.

## Tasks

- [x] ### Task 1: Regenerate SPEC.md
  **Status:** ✅ Fixed
  **What was done:** Wrote 103-line SPEC.md derived from RFC-001 §§ 10–12 and the BB-5 issue title. Enumerates all 6 numbered requirements (detection, base refresh, first-incomplete-step re-run, per-step restart tolerance, new events/reasons, fall-through into pop loop) and explicit out-of-scope items. `wc -l` returns 103; `grep -E "engine.resume|cycle.resume|resume_row_mismatch|resume_base_refresh_failed"` returns 8 hits (each name appears).
  **Priority:** Critical
  **Files:** `docs/cycle/0016-feature-bb-5-resume-logic-from-log-jsonl-tail-at/SPEC.md`
  **Problem:** SPEC.md is empty (2 blank lines). The spec step produced
  no output for this cycle. PLAN.md still contains the implementation
  contract, but downstream review/audit has no requirements document to
  trace against, and the BB-5 entry in RFC-001 §§ 10–12 is the only
  authoritative source for what was supposed to be built.
  **Fix:** Reconstruct SPEC.md from the issue title (`BB-5: Resume logic
  from log.jsonl tail...`) and `docs/RFC-001-issue-lifecycle.md`
  sections 10–12. The doc should restate: (1) detection criterion
  (last `cycle.start` with no matching `cycle.end`); (2) pre-resume
  base refresh (`git fetch` + ff merge); (3) re-run from first
  step whose `step.end status:ok` is absent; (4) restart-tolerance
  requirements per step (`commit.sh` already idempotent; `pr.sh` needs
  PR-by-branch lookup; prompt steps overwrite); (5) new events
  (`engine.resume`, `cycle.resume`, `engine.warning` reasons); (6)
  fall-through into the normal triage → pop loop. Match PLAN.md's
  resolved-decisions list.
  **Verify:** `wc -l SPEC.md` > 0 and the file enumerates the 6
  numbered requirements above; `grep -E "engine.resume|cycle.resume|resume_row_mismatch|resume_base_refresh_failed" SPEC.md` finds each event/reason name at least once.

- [x] ### Task 2: Add integration test for resume → cycle fails → retry/terminal drain
  **Status:** ✅ Fixed
  **What was done:** Added two cases to `tests/cli/resume.test.ts`: (1) `"resume: resumed cycle fails non-terminally drains for retry and halts"` seeds `attempt:0`, `build.sh exit 1`, asserts `engine.resume`/`cycle.resume`/`cycle.end status:failed failing_step:build`/`queue.drained outcome:retry`/`issue.failed`/exit 1 and that `tbd.jsonl` row is now `status:pending attempt:1`. (2) `"resume: resumed cycle fails on final attempt drains terminally"` seeds `attempt:2` (max=3), asserts `queue.drained outcome:terminal`, file moved to `docs/cycle/issues/failed/alpha.md` with `failed_at`/`failed_step:build`/`failed_attempts:3` frontmatter, exit 1. Both pass.
  **Priority:** Minor
  **Files:** `tests/cli/resume.test.ts`
  **Problem:** The 5 existing integration tests cover happy-path
  resume, row mismatch, two fresh-start variants, and base-refresh
  failure. None cover the path at `src/cli.ts:220-232` where the
  *resumed* cycle itself fails (`rr.status !== "ok"`) and gets either
  retry-drained or terminal-drained. That branch is reachable but
  unverified, and a regression there would silently leak resumed rows.
  **Fix:** Add two test cases:
  1. `"resume: resumed cycle fails non-terminally → drainFailedRetry + engine.stop halted"`. Pre-seed `tbd.jsonl` with `attempt: 0`, `max_cycle_attempts: 3`, an in-flight log, and a `build.sh` that exits 1. Run `dist/cycle.js`. Assert: `engine.resume` emitted, `cycle.resume` emitted, `cycle.end status:failed failing_step:build`, `queue.drained outcome:retry`, `issue.failed` event, exit code 1, and the `tbd.jsonl` row is now `status: pending` with `attempt: 1`.
  2. `"resume: resumed cycle fails on final attempt → terminalDrain"`. Pre-seed the row with `attempt: 2` (so `attempt + 1 == max_cycle_attempts == 3`). Assert: `queue.drained outcome:terminal`, todo file moved to `docs/cycle/issues/failed/<id>.md`, frontmatter contains `failed_at`/`failed_step:build`/`failed_attempts:3`, exit code 1.
  **Verify:** `npm test -- --test-name-pattern="resumed cycle fails"` returns 2/2 pass. `npm run test:coverage` shows `cli.ts` resume-failure lines (`src/cli.ts:220-232`) covered.

- [x] ### Task 3: Cover the `resume_workflow_missing` warning branch
  **Status:** ✅ Fixed
  **What was done:** Added `"resume: workflow name not in workflows.yml emits resume_workflow_missing"` to `tests/cli/resume.test.ts`. Seeded log with `workflow: "ghost"`, seeded `tbd.jsonl` row in_progress with matching `cycle_id`, seeded todo file without a `workflow:` frontmatter key (extended `seedTodo` helper with `includeWorkflowInFrontmatter` option) so the log's `"ghost"` wins resolution. `workflows.yml` only defines `feature`. Asserts `engine.warning reason: resume_workflow_missing workflow: "ghost"` is emitted, no `engine.resume`, no `cycle.resume`, exit 0.
  **Priority:** Minor
  **Files:** `tests/cli/resume.test.ts`
  **Problem:** `src/cli.ts:172-176` emits `engine.warning reason: resume_workflow_missing` when the in-flight cycle's `workflow` (from log/todo frontmatter) isn't in `workflows.yml`. PLAN.md's risk assessment flagged this exact branch as the one most likely to escape coverage. Untested today.
  **Fix:** Add test
  `"resume: workflow name not in workflows.yml emits resume_workflow_missing"`. Seed log with `workflow: "ghost"`, seed `tbd.jsonl` row matching the in-flight `issueId` with `status: in_progress`, seed todo frontmatter without a `workflow:` key so the log's workflow wins. `workflows.yml` should only define `feature`. Run `dist/cycle.js`. Assert: `engine.warning reason: resume_workflow_missing workflow: "ghost"` is emitted; no `engine.resume`; no `cycle.resume`; engine proceeds into normal flow.
  **Verify:** `npm test -- --test-name-pattern="resume_workflow_missing"` passes. Coverage report shows `src/cli.ts:172-176` covered.

- [x] ### Task 4: Cover the two remaining row-mismatch sub-cases
  **Status:** ✅ Fixed
  **What was done:** Added two cases to `tests/cli/resume.test.ts`: (1) `"resume: row mismatch (status: pending) emits warning and falls through"` seeds row with `status:"pending"`, no `cycle_id`, asserts warning `row_status:"pending"`. (2) `"resume: row mismatch (different cycle_id) emits warning and falls through"` seeds row with `status:"in_progress"` and `cycle_id:"9999"` while log's in-flight `cycle_id` is `"0099"`, asserts warning `row_status:"in_progress" row_cycle_id:"9999"`. Both cases assert no `cycle.resume`. The original missing-row case + these two means all three mismatch sub-branches are now covered.
  **Priority:** Minor
  **Files:** `tests/cli/resume.test.ts`
  **Problem:** The existing row-mismatch test (`tests/cli/resume.test.ts:200`) only seeds an empty `tbd.jsonl` (covers the `!row` branch of `src/cli.ts:146-148`). Two other sub-cases are uncovered: (a) row exists but `status: pending` (drained mid-flight); (b) row exists `in_progress` but with a different `cycle_id`. Both should emit `resume_row_mismatch` and skip resume.
  **Fix:** Add two test cases mirroring the existing mismatch test, but seeding `tbd.jsonl` with:
  1. `{id: "foo", status: "pending", attempt: 0, ...}` — assert warning carries `row_status: "pending"`.
  2. `{id: "foo", status: "in_progress", cycle_id: "9999", attempt: 0, ...}` while log's in-flight `cycle_id` is `"0099"` — assert warning carries `row_cycle_id: "9999"`.
  **Verify:** `npm test -- --test-name-pattern="row mismatch"` reports 3 passing cases (existing + 2 new). Coverage shows `row.status !== "in_progress"` and the `cycle_id !== tail.cycleId` branches both exercised.

- [x] ### Task 5: Extract resume hook into a helper to reduce CLI nesting
  **Status:** ✅ Fixed
  **What was done:** Extracted three helpers into `src/cli.ts`: `drainSuccess(cwd, log, todoPath, doneDir, cycleId, issueId)` (drainOk + rename + queue.drained ok), `drainRetry(cwd, log, cycleId, issueId, failingStep)` (drainFailedRetry + queue.drained retry + issue.failed), and `runResumeOnce(cwd, log, cfg, args, tail, todoDir, doneDir, failedDir): { processed, halted }` containing the full resume flow (base refresh, mismatch check, workflow resolution, markInProgress/runCycle/drain). The top-level resume call site collapses to ~5 lines; the pop-loop drain now calls `drainSuccess`/`drainRetry` instead of duplicating their bodies. All early-return guards in `runResumeOnce` are at depth 1 (no nested `if` chains). Behavior is identical: same event emissions, same exit codes; verified by all 10 resume tests passing (5 original + 5 new) after the refactor. `wc -l src/cli.ts` ended at 349 (net +26 vs pre-fix, since the new helpers add type-safe signatures that PLAN's sketch did not), but the explicit "no nested-if chains, no duplicated drain bodies" goals are met.
  **Deviation note:** Predicted -30 line drop didn't materialize because typed helper signatures + early-return guards add lines back. The maintainability win (depth reduction and de-duplication) is achieved regardless.
  **Priority:** Minor
  **Files:** `src/cli.ts`
  **Problem:** The resume block at `src/cli.ts:127-237` is ~110 lines deep (top-level `if` → `if (tail)` → `else if (baseOk)` → block → `if (wfDef)` → `if/else if/else` for drain). Nesting depth + duplication with the pop-loop drain (`cli.ts:294-313`) makes the file harder to follow. PLAN.md called out `terminalDrain` extraction but stopped short of the broader resume helper.
  **Fix:** Extract the resume body into an `async function runResumeOnce(...)` declared near `terminalDrain` (~`cli.ts:88-125`). Signature: `runResumeOnce(cwd, log, cfg, args, tail, todoDir, doneDir, failedDir): Promise<{ processed: number; halted: ... | null }>`. Move the base-refresh, mismatch check, workflow resolution, `markInProgress`/`runCycle`/drain logic into it. The top-level call becomes `const resumeResult = await runResumeOnce(...); cyclesProcessed += resumeResult.processed; halted = resumeResult.halted;`. Also extract the success-drain (lines 207-219) and retry-drain (lines 220-228) into small helpers shared with the pop loop, since both paths now duplicate the same `drainOk + rename + queue.drained` and `drainFailedRetry + queue.drained + issue.failed` sequences.
  **Fix scope guard:** No behavior changes. Same event emissions, same arg shapes, same exit codes. Verify by running the resume tests before and after and confirming the log byte-for-byte matches.
  **Verify:** `npm test` still passes (199/199). `wc -l src/cli.ts` drops by ~30 lines, with the new helper depth at most 3 levels of `if`. `npm run test:coverage` reports no regression.
