---
id: refl-0044-structural-invariants-d-mts-is-a-hand-ma
title: Replace structural-invariants .d.mts type mirror with co-located JSDoc types
workflow: feature
depends_on: []
triaged_at: 2026-06-03T16:44:34.308Z
source: triage
priority: medium
---
Cycle 0044 added `scripts/structural-invariants.d.mts` — a hand-written declaration surface (`Invariant`, `INVARIANTS`, `runInvariants`) — purely so the TS test (`tests/scripts/structural-invariants.test.ts`) can statically import the `.mjs` exports under `tsc --noEmit`. Nothing ties this `.d.mts` to the real `.mjs` exports: a future change to `runInvariants`'s signature or the `INVARIANTS` entry shape can silently drift from the declaration, leaving the test type-checking against stale types that no longer match runtime — eroding the guarantee cycle 0044 set out to add.

This is the hand-maintained-mirror anti-pattern the repo elsewhere eliminates by derivation (`ARTIFACT_STEPS` from `STEP_ARTIFACTS` keys, `knownAgents()` from `REGISTRY`) or machine-checks (the `AGENT_BINARY` and residue arm→persist structural invariants). The types should live with the implementation so drift becomes a typecheck failure rather than a silent gap.

## Goal

Drop the separate `scripts/structural-invariants.d.mts` in favor of JSDoc `@typedef`/`@param`/`@returns` annotations inside `scripts/structural-invariants.mjs`, so the `Invariant` shape, the `INVARIANTS` array type, and the `runInvariants(invariants, cwd)` signature are declared co-located with the runtime code and checked against it.

## Acceptance

- `scripts/structural-invariants.d.mts` is removed.
- `scripts/structural-invariants.mjs` carries JSDoc annotations covering the `Invariant` entry shape (both count-based and relational/predicate kinds), the exported `INVARIANTS` constant, and the `runInvariants` signature/return.
- The `.mjs` is type-checked (via `checkJs`/`allowJs` config scoped appropriately, or the project's existing typecheck wiring) so a signature/shape change that diverges from the annotations fails `npm run typecheck`.
- `tests/scripts/structural-invariants.test.ts` still type-checks and runs green against the real `.mjs` exports (no stale-type gap).
- `npm run typecheck`, `npm test`, and `npm run check:invariants` all pass; ensure the new `checkJs` scope does not regress typechecking of other `scripts/**` files or introduce warnings.

Keep the change minimal and agnostic — co-locate the existing types, don't expand the invariant API.
