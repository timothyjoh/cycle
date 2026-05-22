---
id: refl-0246-pre-existing-ts2345-typecheck-error-in-s
title: Fix pre-existing TS2345 typecheck error on CYCLE_TRUNK_BASED in src/cli.ts
workflow: feature
depends_on: []
triaged_at: "2026-05-21T23:49:10.111Z"
source: triage
priority: medium
---
## Problem

`src/cli.ts:241` emits TS2345 when `npm run typecheck` (`tsc --noEmit`) is run. The error was introduced in commit `ad669f5` (engine: re-inject CYCLE_TRUNK_BASED into run-one child env) and has persisted across multiple subsequent cycles without being resolved.

Per CLAUDE.md, `npm run typecheck` is a required gate — zero warnings or errors allowed. The error is currently a latent violation: cycles observe it in BUILD.md and REVIEW.md artifacts but work around it rather than fixing it. If the surrounding type context changes or `typecheck` is enforced as a hard pre-commit gate, the build will break.

## Root cause (likely)

`process.env.CYCLE_TRUNK_BASED` has type `string | undefined`. At `src/cli.ts:241` it is passed to a call site or assignment target that expects `string`, producing TS2345.

## Steps

1. Run `npm run typecheck` and confirm the TS2345 error at `src/cli.ts:241`.
2. Inspect the `CYCLE_TRUNK_BASED` usage at that line and determine whether the value is guaranteed to be present at runtime.
3. Apply the minimal safe fix:
   - If always present at that call site: add a nullish coalescing default (`?? ""` or `?? "0"`) or a narrowing guard.
   - If the presence is uncertain: propagate `string | undefined` through the call site, or gate the call on a truthiness check.
   - Avoid unqualified non-null assertions (`!`) unless the invariant is airtight and commented.
4. Re-run `npm run typecheck` — confirm exit zero, no errors, no warnings.
5. Run `npm test` — confirm no regressions.

## Acceptance

- `npm run typecheck` exits zero.
- `npm test` passes (all gates: coverage, invariants, typecheck).
- No new unsafe casts introduced without explanation.
