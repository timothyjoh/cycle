## Summary

All 3 MUST-FIX tasks addressed. Final test run: 648 tests pass, all coverage gates pass — line 98.53%, branch 92.53%, function 92.95% (no regression vs BUILD.md baseline). Task 1: SPEC.md rewritten with full Problem/Solution/Out-of-Scope/Acceptance Criteria structure. Task 2: PLAN.md traceability table updated with verbatim AC bullets from the new SPEC.md. Task 3 (minor): Warning test converted from `.find()` + `assert.ok()` to `filter().length === 1` + `assert.equal()` per CLAUDE.md cardinality-pinning convention.
