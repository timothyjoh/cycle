---
id: refl-0198-prepaths-rename-copy-branch-in-pre-snaps
title: Add test coverage for prePaths rename/copy branch in pre-snapshot loop
workflow: feature
depends_on: []
triaged_at: "2026-05-20T04:51:54.021Z"
source: triage
---
## Context

Lines 73–75 of `src/engine/run-cycle.ts` handle the R/C (rename/copy) prefix case inside the `prePaths` pre-snapshot loop. The post-snapshot rename path is covered by the existing "R-prefix porcelain" test at line 387 of `tests/run-cycle.documentation.test.ts`, but the pre-snapshot rename branch is a dead branch in coverage. A regression there — wrong arrow index, off-by-one in `slice`, wrong prefix check — would go undetected.

## Acceptance Criteria

- [ ] Add a test in `tests/run-cycle.documentation.test.ts` where the pre-snapshot porcelain output contains an `R`-prefix line (rename), simulating a file renamed by the build step before the doc step runs
- [ ] The rename destination path is present in `prePaths` and is therefore excluded from the set appended by `appendDocumentationPaths`
- [ ] The doc step in the same test scenario touches a separate file absent from the pre-snapshot; that path IS included in the appended set
- [ ] Lines 73–75 of `src/engine/run-cycle.ts` (the R/C branch inside the pre-snapshot loop) are exercised and covered
- [ ] `npm test` passes (full suite, no failures)
- [ ] `npm run test:coverage` passes all gates including per-file floors

## Implementation Notes

The pre-snapshot is captured via `spawnSync('git', ['status', '--porcelain'])` at approximately line 299 of `run-cycle.ts` before the doc step executes. In tests, the git repo state is controlled via fixture commits; to trigger an R-prefix line, stage a rename (e.g. `git mv old.md new.md` and leave it staged) before calling the function under test, or mock `spawnSync` to return a fabricated porcelain string with the rename line.

The post-snapshot test at line 387 uses the same porcelain parsing logic and can serve as a structural template for the new pre-snapshot scenario.
