All 4 tasks fixed. Test suite: 59 pass / 0 fail.

**Summary:** Task 1 (ordering assertion via line-index comparison) and Task 3 (head_before in regex) applied to both checkout tests. Task 2 added new test for `status="failed"` checkout branch using `CYCLE_BASE: "no-such-base"`. Task 4 added `CYCLE_BASE: "main"` to env of pre-existing happy-path test for hermeticity. Final `npm test`: 59 pass, 0 fail. No tasks deferred.
