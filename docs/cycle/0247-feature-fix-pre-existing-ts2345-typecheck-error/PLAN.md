# Implementation Plan: Cycle 0247

## Overview

Fix the TS2345 typecheck error at `src/cli.ts:241` by adding an explicit `Record<string, string>` type annotation to the `extra` variable at line 236, restoring compliance with the `tsc --noEmit` gate required by CLAUDE.md.

## Current State (from Research)

- **Error site**: `src/cli.ts:236` — `const extra = process.env.CYCLE_TRUNK_BASED === "1" ? { CYCLE_TRUNK_BASED: "1" } : {};`
- TypeScript's strict mode infers the type as `{ CYCLE_TRUNK_BASED: string } | { CYCLE_TRUNK_BASED?: undefined }` — the falsy branch `{}` picks up an optional `undefined`-valued property from the union, making it incompatible with `Record<string, string>`.
- **Call site**: `src/cli.ts:241` — `buildChildEnv(extra)` — parameter typed `Record<string, string>` (must not change per SPEC).
- **Established pattern**: Other callers (`exec-spawn.ts:22`, `commit-cycle.ts:20,29,84`) normalize optional records via `?? {}` before passing; explicit type annotation is the minimal equivalent for this ternary.
- No new tests required per SPEC; existing suite (`npm test`) covers the full gate.

## Desired End State

`src/cli.ts:236` reads:
```ts
const extra: Record<string, string> = process.env.CYCLE_TRUNK_BASED === "1" ? { CYCLE_TRUNK_BASED: "1" } : {};
```
`npm run typecheck` exits zero. `npm test` passes all gates (build, tests, coverage, invariants, typecheck).

## What We're NOT Doing

- No change to `buildChildEnv` signature or `child-env.ts`.
- No refactoring of the broader env-injection pattern.
- No new unit tests (SPEC explicitly waives this).
- No changes to any other call sites.
- No non-null assertions (`!`).

## Implementation Approach

Single-line fix: add `: Record<string, string>` annotation to the `extra` declaration at `src/cli.ts:236`. This is the minimal diff that widens the inferred union type to the explicit concrete type, satisfying the `buildChildEnv` parameter constraint in both branches without altering runtime behavior.

---

## Task 1: Annotate `extra` with `Record<string, string>` at `src/cli.ts:236`

### Overview

Replace the untyped ternary declaration with an explicitly typed one so TypeScript accepts both branches as `Record<string, string>`.

### Changes Required

**File**: `src/cli.ts`

**Line 236** — change:
```ts
const extra = process.env.CYCLE_TRUNK_BASED === "1" ? { CYCLE_TRUNK_BASED: "1" } : {};
```
to:
```ts
const extra: Record<string, string> = process.env.CYCLE_TRUNK_BASED === "1" ? { CYCLE_TRUNK_BASED: "1" } : {};
```

No other lines change.

### Success Criteria

- [ ] `npm run typecheck` exits zero (no errors or warnings).
- [ ] `npm test` passes: build, all tests, coverage gates, invariants, typecheck.
- [ ] No non-null assertion (`!`) present at the fix site.
- [ ] `extra` satisfies `Record<string, string>` in both ternary branches.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] npm run typecheck exits zero with no errors or warnings.` | Task 1 | Verified by running `npm run typecheck` after the annotation change |
| `[ ] npm test passes with all gates: tests, coverage, invariants, typecheck.` | Task 1 | Verified by running `npm test` after the annotation change |
| `[ ] No non-null assertion (!) introduced at the fix site.` | Task 1 | Explicit annotation approach uses no `!` |
| `[ ] The extra object passed to buildChildEnv satisfies Record<string, string> in both branches of the conditional.` | Task 1 | Annotation widens both branches to `Record<string, string>` |

---

## Testing Strategy

### Unit Tests

None required per SPEC. The fix is a one-line type annotation with no branching behavior change; the existing suite already covers `buildChildEnv` behavior in `tests/engine/child-env.test.ts`.

### Integration / E2E Tests

`npm test` (full suite: build → tests → coverage gate → invariants → typecheck) serves as the integration verification. Runtime behavior of `CYCLE_TRUNK_BASED` re-injection is unchanged; no regression expected.

## Risk Assessment

- **Minimal risk**: The change is a single type annotation; it does not alter emitted JavaScript or runtime behavior.
- **Coverage floors**: `src/cli.ts` has no per-file floor in `scripts/coverage-gate.mjs`; no coverage regression possible from this change.
- **Other callers**: The fix is isolated to the `extra` declaration inside `spawnRunOne`; no other call sites are touched.
