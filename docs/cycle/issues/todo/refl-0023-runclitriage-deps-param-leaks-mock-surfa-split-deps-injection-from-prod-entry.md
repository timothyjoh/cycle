---
id: refl-0023-runclitriage-deps-param-leaks-mock-surfa-split-deps-injection-from-prod-entry
title: "Split runCliTriage: pure with-deps unit entry point + thin prod wrapper with hardcoded deps"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T19:47:50.767Z"
source: triage
parent: refl-0023-runclitriage-deps-param-leaks-mock-surfa
---
## Problem

Cycle 0023 REVIEW.md Code-Quality Finding 3 flagged that `runCliTriage` in `src/cli/triage.ts` gained an optional `deps: TriageDeps = {}` parameter purely to unblock per-file 100/100/100 coverage. Production caller `src/cli.ts` only ever passes `argv.slice(1)`, so the slot defaults to `{}` and threads real dependencies. The slot is callable, though: any future change in `cli.ts` could accidentally inject mock plumbing (fake `runAgent`, fake `loadConfig`, fake `readdir`) into the production path. The mock surface used for tests has leaked into the production signature.

## Approach

Apply option (b) from the reflection: split the file into two named exports.

1. Introduce `runCliTriageWithDeps(repoRoot: string, argv: string[], deps: TriageDeps): Promise<number>` as the pure, fully injectable entry point. Move the entire current body here. Keep `TriageDeps` exported so the test file can build a deps object directly.
2. Reduce `runCliTriage(repoRoot: string, argv: string[]): Promise<number>` to a thin wrapper that constructs the real deps (the same defaults currently inlined in the destructuring step) and delegates: `return runCliTriageWithDeps(repoRoot, argv, { runAgent, loadConfig, readdir, ... })`. No conditional logic, no test surface.
3. Update `src/cli.ts` to keep importing `runCliTriage` — the prod call site signature does not change.
4. Update `tests/cli/triage.test.ts` to import `runCliTriageWithDeps` for every unit test that needs to stub. The wrapper is unit-tested with a single spawn-based or near-spawn-based smoke test that proves it wires real deps (or, if cheaper, asserted via a thin test that monkeypatches the module-scope imports for the wrapper invocation only).

## Acceptance

- `runCliTriage(repoRoot, argv)` has the two-arg signature in `src/cli/triage.ts` and `cli.ts` calls it unchanged.
- `runCliTriageWithDeps(repoRoot, argv, deps)` is the unit-test entry point; the existing per-deps unit tests pass against it with no behavioral diff.
- Grep `src/` for `runCliTriage(` shows the prod path cannot pass deps (compile-time, not just by convention).
- `tests/cli/triage.test.ts` continues to drive the 100/100/100 per-file coverage for `src/cli/triage.ts`.
- Full `npm test` and `npm run test:coverage` green; coverage baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%) held; no per-file regressions on `src/cli/triage.ts` or `src/cli.ts`.
- `npm run typecheck` clean.

## Out of scope

- Reworking `TriageDeps` shape or what is injectable.
- Any change to `dryRunTriage` injection — that is covered by sibling raw `refl-0023-dry-run-untested-paths-runagent-throws-a` and may follow the same split-pattern there, but is not bundled into this cycle.
