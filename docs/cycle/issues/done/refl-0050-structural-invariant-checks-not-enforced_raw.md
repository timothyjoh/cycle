---
id: refl-0050-structural-invariant-checks-not-enforced
source: reflection
title: structural-invariant-checks-not-enforced-by-tests-need-build-time-guard
added_at: "2026-05-14T18:16:49.882Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0050"
---

Cycle 0050's PLAN Task 2 success criterion required "the new test fails if `childIds` is artificially split back into two sets — confirms the test is load-bearing on the consolidation." REVIEW.md Finding 1 (Adversarial) confirmed this criterion is unmet: `tests/engine/triage-validator.test.ts:305-340` exercises both consumers in one happy-path output but passes equally well whether `childIds` is one canonical set or two synchronized copies, because the validator's public API exposes only accept/reject + parsed output. The structural invariant is currently held only by a one-shot manual `rg` performed during BUILD; nothing prevents a future contributor from re-introducing the duplicate set.

This is a general gap, not specific to `childIds`: any "exactly one of X" or "X is the single source of truth" invariant in a pure function has the same property. The right enforcement is a build-time syntactic / AST check, analogous to `scripts/coverage-gate.mjs`'s per-file line floor — e.g., a `scripts/structural-invariants.mjs` that asserts `rg -c 'const childIds = new Set' src/engine/triage.ts == 1` and 0 hits for `new Set\(children\.map\(\(c\) => c\.id\)\)`. Wire it into `npm run typecheck` or `posttest:coverage` so refactor-revert is caught at CI, not on read-through.

Suggested direction: bake a small invariant table (file, regex, expected count) into a script the test+coverage steps already run. Start with `triage.ts` `childIds`; extend as future cycles surface more "canonical single instance" invariants.
