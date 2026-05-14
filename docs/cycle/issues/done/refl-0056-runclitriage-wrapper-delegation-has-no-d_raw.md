---
id: refl-0056-runclitriage-wrapper-delegation-has-no-d
source: reflection
title: runclitriage-wrapper-delegation-has-no-dedicated-test
added_at: "2026-05-14T20:25:11.368Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0056"
---

`src/cli/triage.ts` now exports a two-arg `runCliTriage` whose entire body is `return runCliTriageWithDeps(repoRoot, argv, {});`. PLAN.md and REVIEW.md both acknowledge the wrapper's coverage is *load-bearing on the empty-`raw/` `--dry-run` case happening to call the two-arg form* — there is no explicit test that asserts the wrapper exists, takes exactly two parameters, and delegates to `runCliTriageWithDeps` with `{}`.

If a future cleanup migrates the four remaining deps-free tests (`--help`, `-h`, no-flag, empty-`raw/`) to `runCliTriageWithDeps` for consistency, the wrapper goes uncovered silently and coverage stays at 100% only because the file is small. The compile-time guarantee (no third arg) is exactly the invariant worth pinning with a one-line test that calls `runCliTriage(root, ['--help'])` and asserts shape.

Suggested fix: add a single `triage-wrapper-delegation` test that invokes `runCliTriage(root, ['--dry-run'])` against an empty `raw/` and asserts `{exitCode: 0, stdout: '[]\n'}`. Pins the delegation contract independent of the deps-free suite's evolution.
