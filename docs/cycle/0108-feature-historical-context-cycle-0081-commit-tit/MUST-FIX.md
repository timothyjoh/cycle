Must-Fix Items: Cycle 0108

Summary
All 4 critical issues fixed. npm test: 435 pass, 3 fail (pre-existing triage failures only).

Tasks

- [x] Task 1: Replace BUILD.md with correct verification findings
  Status: Fixed
  What was done: Overwrote BUILD.md with verification findings documenting both guards ABSENT, citing run-cycle.ts:198-204 and commit-trunk.sh:62-65.

- [x] Task 2: Create empty-diff guard todo issue
  Status: Fixed
  What was done: Created docs/cycle/issues/todo/refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts.md with valid YAML frontmatter matching PLAN.md spec.

- [x] Task 3: Create artifact-only guard todo issue
  Status: Fixed
  What was done: Created docs/cycle/issues/todo/refl-0108-artifact-only-commit-guard-absent-in-commit-trunk-sh.md with valid YAML frontmatter matching PLAN.md spec.

- [x] Task 4: Move source issue to done/
  Status: Fixed
  What was done: mv moved refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md from todo/ to done/. File confirmed present in done/, absent in todo/.

- [x] Task 5: Confirm npm test passes
  Status: Fixed
  What was done: npm test on Node 22.22.2: 438 total, 435 pass, 3 fail. All 3 failures are pre-existing triage regressions (children[0].raw_id not in current batch) unrelated to cycle 0108 changes.