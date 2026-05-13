---
id: refl-0023-runclitriage-deps-param-leaks-mock-surfa
source: reflection
title: runclitriage-deps-param-leaks-mock-surface-to-production
added_at: "2026-05-13T19:42:58.583Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0023"
---

REVIEW.md Code-Quality Finding 3 flags that `runCliTriage` gained an optional `deps: TriageDeps = {}` parameter purely to unblock per-file 100/100/100 coverage on `src/cli/triage.ts`. In production, `cli.ts` calls it with `argv.slice(1)` only and the deps default to `{}`. The slot is callable, though, so a future change that threads anything from `cli.ts` could accidentally inject mock plumbing into the production path.

Suggested direction: either (a) drop the `deps` param and write the missing func-coverage test as a spawn-based E2E that exercises the production path, or (b) split the file into a pure `runCliTriageWithDeps(repoRoot, argv, deps)` (unit-test entry point) and a thin `runCliTriage(repoRoot, argv)` wrapper that hard-codes the real deps and is the only export consumed by `cli.ts`. Option (b) keeps coverage and closes the leak.
