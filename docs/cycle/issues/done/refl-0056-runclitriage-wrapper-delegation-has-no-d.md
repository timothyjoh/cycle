---
id: refl-0056-runclitriage-wrapper-delegation-has-no-d
title: Pin runCliTriage two-arg wrapper delegation to runCliTriageWithDeps with a dedicated test
workflow: quickfix
depends_on: []
triaged_at: "2026-05-14T20:27:31.947Z"
source: triage
---
`src/cli/triage.ts` now exports a two-arg `runCliTriage` whose entire body is `return runCliTriageWithDeps(repoRoot, argv, {});`. PLAN.md and REVIEW.md from cycle 0056 both acknowledge the wrapper's coverage is *load-bearing on the empty-`raw/` `--dry-run` case happening to call the two-arg form* — there is no explicit test that asserts the wrapper exists, takes exactly two parameters, and delegates to `runCliTriageWithDeps` with `{}`.

If a future cleanup migrates the four remaining deps-free tests (`--help`, `-h`, no-flag, empty-`raw/`) to `runCliTriageWithDeps` for consistency, the wrapper goes uncovered silently and coverage stays at 100% only because the file is small. The compile-time guarantee (no third arg) is exactly the invariant worth pinning with a one-line test that calls `runCliTriage(root, ['--help'])` and asserts shape.

## Acceptance

- Add a single `triage-wrapper-delegation` test (in the existing `tests/cli/triage.*.test.ts` family or a new `triage-wrapper.test.ts`) that invokes `runCliTriage(root, ['--dry-run'])` against an empty `raw/` and asserts `{exitCode: 0, stdout: '[]\n'}`.
- Test must call the two-arg `runCliTriage` directly (not `runCliTriageWithDeps`) so the wrapper line is exercised independently of the deps-free suite.
- No new production code; this is a coverage-pin / contract-pin only.
- Coverage gate stays green; no regressions in `src/cli/triage.ts`.

## Origin

Reflection from cycle 0056 (split runCliTriage: pure with-deps unit entry point + thin prod wrapper).
