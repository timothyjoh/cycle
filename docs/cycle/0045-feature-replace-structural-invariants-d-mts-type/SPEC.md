# SPEC — Cycle 0045: Co-locate structural-invariants types via JSDoc, drop the hand-written .d.mts mirror

## WHY
Cycle 0044 added `scripts/structural-invariants.d.mts` — a hand-written
declaration surface (`Invariant`, `INVARIANTS`, `runInvariants`) — purely so the
TypeScript test `tests/scripts/structural-invariants.test.ts` can statically
import the `.mjs` exports under `tsc --noEmit`. Nothing ties that `.d.mts` to the
real runtime exports: a change to `runInvariants`'s signature or the `INVARIANTS`
entry shape can silently drift from the declaration, leaving the test
type-checking against stale types that no longer match runtime. That erodes the
very guarantee cycle 0044 set out to add and reintroduces the
hand-maintained-mirror anti-pattern the repo elsewhere eliminates by derivation
(`ARTIFACT_STEPS` from `STEP_ARTIFACTS`, `knownAgents()` from `REGISTRY`) or by
machine-checks (the `AGENT_BINARY` and residue arm→persist invariants).

## CONCRETE USER BENEFIT
A maintainer who changes `runInvariants`'s signature or the `Invariant` entry
shape in `scripts/structural-invariants.mjs` now gets a `npm run typecheck`
failure if the declared types and the implementation diverge — because the types
are checked *against* the implementation, not against a parallel hand-written
file that can quietly rot. There is no longer a separate file to remember to
update; drift is caught by the type checker instead of slipping through to a
green-but-stale test.

## USABLE END-STATE
`scripts/structural-invariants.d.mts` no longer exists. The `Invariant` shape,
the `INVARIANTS` constant type, and the `runInvariants(invariants, cwd)`
signature are declared as JSDoc annotations co-located with the runtime code in
`scripts/structural-invariants.mjs`, type-checked against that code. The test
imports and type-checks against the real `.mjs` exports with no intermediary
declaration. `npm run typecheck`, `npm test`, and `npm run check:invariants` all
pass with no new warnings, and no other `scripts/**` file regresses.

## Objective
Replace the hand-written `scripts/structural-invariants.d.mts` type mirror with
JSDoc `@typedef`/`@param`/`@returns` annotations inside
`scripts/structural-invariants.mjs`, and enable JS type-checking for that module
so the annotations are verified against the runtime code. This converts a silent
drift gap into a typecheck failure while keeping the change minimal and
agnostic — co-locating the existing types, not expanding the invariant API.

## Source Issue
`refl-0044-structural-invariants-d-mts-is-a-hand-ma` — "Replace
structural-invariants .d.mts type mirror with co-located JSDoc types"

## Scope

### In Scope
- Add JSDoc annotations to `scripts/structural-invariants.mjs` declaring the
  `Invariant` entry shape (covering both the count-based `{ file, pattern,
  expected, reason }` kind and the relational `{ file, validate, reason }` kind),
  the exported `INVARIANTS` constant type, and the `runInvariants(invariants,
  cwd)` parameter/return signature.
- Enable type-checking of the `.mjs` (via `checkJs`/`allowJs` scoped so it does
  not change how other `scripts/**` files are checked) and delete
  `scripts/structural-invariants.d.mts`.

### Out of Scope
- Any change to the structural-invariants runtime behavior, the `INVARIANTS`
  table entries, or the CLI exit-code contract (0/1/2).
- Adding new invariants or expanding the `Invariant` API beyond the existing
  fields.
- Migrating other `scripts/**/*.mjs` files to JSDoc type-checking.

## Requirements
- The `Invariant` JSDoc typedef must capture the optional `pattern: RegExp`,
  `expected: number`, and `validate: (text: string, file: string) => { ok:
  boolean; actual?: string; message?: string }` fields plus the required `file`
  and `reason` strings — the same surface the deleted `.d.mts` declared.
- `runInvariants` must be annotated to accept the `Invariant[]` array and a
  `cwd` string and to return `Promise<number>` (the failure count).
- The `.mjs` must be type-checked under the project's typecheck wiring such that
  a divergence between the annotations and the implementation produces a
  `npm run typecheck` error.
- The `checkJs`/`allowJs` scope must not introduce typecheck errors or warnings
  for any other file currently in the `scripts/**/*.mjs` include set; if enabling
  `checkJs` globally would surface pre-existing issues in sibling `.mjs` files,
  scope the JS-checking narrowly (e.g. a dedicated include/exclude or a per-file
  directive) so only the target module is checked.
- The module's importability and CLI behavior (the `import.meta` main guard,
  exit codes, stdout/stderr text) must remain byte-for-byte unchanged — this is a
  types-only change.
- **Failure behavior**: This is a build-tooling/types change with no new runtime
  failure surface. The relevant failure path is the type checker itself: when the
  JSDoc annotations and the implementation diverge (e.g. `runInvariants` return
  type or `Invariant` field shape changed in one place but not the other), `npm
  run typecheck` must fail loudly with a non-zero exit and a diagnostic naming the
  mismatch — never pass silently. The structural-invariants runtime continues to
  surface read failures as exit 2 and rule failures as exit 1 exactly as before;
  no error handling is added, removed, or swallowed.

## Acceptance Criteria
- [ ] `scripts/structural-invariants.d.mts` no longer exists in the repository.
- [ ] `scripts/structural-invariants.mjs` carries JSDoc annotations for the
  `Invariant` entry shape (both kinds), the exported `INVARIANTS` constant, and
  the `runInvariants` signature/return, type-checked against the runtime code.
- [ ] **(User-observable benefit / drift-is-caught proof)** Temporarily editing
  the JSDoc `runInvariants` return annotation to a type that disagrees with the
  implementation (or editing an `Invariant` field) causes `npm run typecheck` to
  exit non-zero with a diagnostic — demonstrating the types are checked against
  the code; reverting restores a clean pass. (Demonstrate in `BUILD.md`; the
  committed tree type-checks clean.)
- [ ] **(Failure-path criterion)** With the divergence above present, `npm run
  typecheck` reports the mismatch and exits non-zero rather than passing silently.
- [ ] `tests/scripts/structural-invariants.test.ts` type-checks and runs green
  importing the real `.mjs` exports, with no `.d.mts` present.
- [ ] `npm run typecheck` passes with no warnings, and no other `scripts/**/*.mjs`
  file regresses (verified by a clean typecheck run).
- [ ] `npm test` and `npm run check:invariants` pass.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- No new product code; rely on the existing test framework (Node's built-in test
  runner via `npm test`) and `tsc --noEmit` via `npm run typecheck`.
- Confirm `tests/scripts/structural-invariants.test.ts` still type-checks and
  passes against the real `.mjs` exports with the `.d.mts` removed (regression).
- Verify the drift-detection behavior manually during build: introduce a
  deliberate annotation/implementation mismatch, observe a non-zero `npm run
  typecheck`, then revert. Record the before/after in `BUILD.md`.
- Confirm `npm run typecheck` over the full include set produces zero errors and
  zero warnings (no regression in sibling `scripts/**/*.mjs` files).
- Run `npm run check:invariants` to confirm the structural-invariants gate itself
  still passes after the change.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Update the *Structural-invariants policy* section's
  note that the module is import-safe / test-driven to reflect that its types now
  live as co-located JSDoc in the `.mjs` (checked against the implementation)
  rather than in a separate `.d.mts` mirror. Only adjust if the existing text
  references the `.d.mts`; keep the edit minimal.
- **README.md**: No user-facing change — omit.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `scripts/structural-invariants.mjs` and its current exports (`INVARIANTS`,
  `runInvariants`, the `import.meta` CLI main guard) — already present.
- `tests/scripts/structural-invariants.test.ts` importing from the `.mjs` —
  already present.
- `tsconfig.json` with `scripts/**/*.mjs` already in `include`; TypeScript
  toolchain via `npm run typecheck` (`tsc --noEmit`).
- No external services or env vars.
