---
id: refl-0198-prepaths-rename-copy-branch-in-pre-snaps
source: reflection
title: prePaths rename/copy branch in pre-snapshot loop has no test coverage
added_at: "2026-05-20T04:47:36.243Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0198"
---

Lines 73–75 of `run-cycle.ts` handle the R/C prefix case inside the `prePaths` loop (pre-snapshot rename/copy extraction). Both BUILD.md and REVIEW.md acknowledge this branch is uncovered.

The post-snapshot rename path is exercised by the existing "R-prefix porcelain" test (line 387 of `run-cycle.documentation.test.ts`), and the pre-snapshot loop uses identical logic. But the pre-snapshot rename branch remains a dead branch in coverage, meaning a regression there (e.g., wrong arrow index or off-by-one in `slice`) would not be caught by the test suite.

Suggested fix: add a test scenario where the build step renames a file (producing an R-prefix line in the pre-snapshot), then the doc step modifies a different file; assert the rename destination is excluded from the appended set.
