# SPEC — Cycle 0247: Fix TS2345 Typecheck Error on CYCLE_TRUNK_BASED in src/cli.ts

## Objective

`npm run typecheck` currently exits non-zero due to a TS2345 error at `src/cli.ts:241`. The error was introduced in commit `ad669f5` when `CYCLE_TRUNK_BASED` re-injection was added to the `runOne` spawn helper. The ternary expression produces `{ CYCLE_TRUNK_BASED?: undefined }` in its falsy branch, which TypeScript correctly rejects as incompatible with `Record<string, string>`. This cycle delivers the minimal type-safe fix so that the typecheck gate is clean, restoring compliance with the CLAUDE.md requirement that `tsc --noEmit` exits zero.

## Source Issue

`refl-0246-pre-existing-ts2345-typecheck-error-in-s` — "Fix pre-existing TS2345 typecheck error on CYCLE_TRUNK_BASED in src/cli.ts"

## Scope

### In Scope

- Fix the TS2345 error at `src/cli.ts:241` so `npm run typecheck` exits zero.
- Preserve the runtime semantics: `CYCLE_TRUNK_BASED` is re-injected only when it equals `"1"`.

### Out of Scope

- Changing the `buildChildEnv` signature or its callers beyond the one fix site.
- Any refactoring of `child-env.ts` or the broader env-injection pattern.
- Adding new test coverage beyond confirming the existing suite passes.

## Requirements

- The fix must not use an unqualified non-null assertion (`!`).
- The fix must not change the runtime behavior: the child env includes `CYCLE_TRUNK_BASED: "1"` if and only if the parent env has `CYCLE_TRUNK_BASED === "1"`.
- `buildChildEnv` must continue to receive a `Record<string, string>` (no signature change).

## Acceptance Criteria

- [ ] `npm run typecheck` exits zero with no errors or warnings.
- [ ] `npm test` passes with all gates: tests, coverage, invariants, typecheck.
- [ ] No non-null assertion (`!`) introduced at the fix site.
- [ ] The `extra` object passed to `buildChildEnv` satisfies `Record<string, string>` in both branches of the conditional.

## Testing Strategy

- Run `npm run typecheck` before and after the fix to confirm the error is resolved.
- Run `npm test` to confirm no regressions in the full suite (build, tests, coverage gate, invariants).
- No new unit tests are required: the fix is a one-line type correction at a call site with no branching behavior change.

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No change — the typecheck gate requirement is already documented.
- **README.md**: No change — user-facing behavior is unchanged.

## Dependencies

- `src/engine/child-env.ts` — `buildChildEnv(extra: Record<string, string>)` must remain as-is; the fix adapts the call site to satisfy the existing signature.
- Node ≥ 22.6 and TypeScript config as defined in `tsconfig.json` (ES2023 target).
