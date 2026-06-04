I have everything needed. Writing the plan to stdout.

# Implementation Plan: Cycle 0261

## Overview
Repair the single standing `TS2339` error at `tests/cli/iteration-too-fast.test.ts:152` by narrowing the parsed `engine.halted` event to an array-bearing shape, so `npm run typecheck` returns to exit 0 with the assertion semantics preserved byte-for-byte.

## Current State (from Research)
- `npm run typecheck` (`tsc --noEmit`) exits non-zero with exactly one diagnostic: `tests/cli/iteration-too-fast.test.ts(152,46): error TS2339: Property 'length' does not exist on type '{}'`.
- The offending line is `assert.deepEqual(halts[0].failed_cycles?.length, 1, "one failed cycle recorded")` (`tests/cli/iteration-too-fast.test.ts:152`).
- `readEvents` (lines 97–100) returns `Promise<Array<Record<string, unknown>>>`. The `filter` at lines 147–149 is not a type guard, so `halts[0]` is `Record<string, unknown>` and `halts[0].failed_cycles` is `unknown` (surfaced as `{}`). Member access `.length` on `unknown` fails under `strict: true` (`tsconfig.json:7`).
- Of every parsed-field access in the suite, **only line 152 calls a member (`.length`)** on a parsed field; all other sites (e.g. line 151 `halts[0].threshold`) compare the `unknown` value directly via `assert.equal`/`assert.deepEqual`, which accept `unknown` and therefore type-check.
- In-file precedent for inline cast-to-shape narrowing already exists at line 134: `(w.duration_ms as number)`. The array-bearing analog is the SPEC's suggested form.
- The `?.` optional chain at line 152 must be retained: a missing `failed_cycles` must collapse to `undefined` so `assert.deepEqual(undefined, 1, …)` fails loudly rather than throwing or silently passing.

## Desired End State
- `npm run typecheck` exits 0 with zero diagnostics on `master`.
- `npm test` passes, including the `iteration-too-fast` suite, with line 152 still asserting "exactly one failed cycle recorded".
- `git diff` is confined to `tests/cli/iteration-too-fast.test.ts`; no `src/**`, no gate-script, no other test file changes.
- Verify: run `npm run typecheck` (expect exit 0, no `TS2339`), then `npm test` (expect green), then `git diff --name-only` (expect only the one test file).

## What We're NOT Doing
- No change to engine source (`src/**`), the `engine.halted` payload shape, or the structural-invariants / coverage gates.
- Not touching `refl-0246` (a separate TS2345 error in `src/**`) — distinct error, out of scope.
- Not broadening the `readEvents` return type, refactoring the event-parsing helper, or adding a shared event-type definition beyond what this one site needs.
- Not changing any assertion's expected value, message, count, runtime control flow, spawned subprocesses, or test fixtures.
- No blanket `as any` that discards all type information.
- No new tests (no new runtime behavior to cover).

## Implementation Approach
Apply the minimal honest narrowing at the single read site. Replace `halts[0].failed_cycles?.length` with `(halts[0] as { failed_cycles?: unknown[] }).failed_cycles?.length`. This casts the indexed event to an object shape that declares `failed_cycles` as an optional `unknown[]`, giving `.length` a valid array type while keeping the value's element type as `unknown` (honest — it asserts only "this is an optional array", not its contents). The `?.` optional chain is preserved exactly, so the failure semantics (missing `failed_cycles` → `undefined` → `deepEqual(undefined, 1)` fails) are unchanged. The cast mirrors the existing in-file convention at line 134, keeping the blast radius to one line.

## Failure & Resilience Decisions
**Task 1 (the typing change):** N/A — pure (compile-time-only). This is a static type annotation at a single read site; it introduces no I/O, subprocess, network, or filesystem-write surface. The only relevant failure mode is the static gate itself, and it is addressed by design: the retained `?.` optional chain ensures a runtime-absent `failed_cycles` yields `undefined` and the existing `assert.deepEqual(undefined, 1, …)` fails loudly — no error is swallowed, no `TypeError` is thrown, and no false pass is manufactured. The honest narrowing to `{ failed_cycles?: unknown[] }` (not `as any`) means the cast cannot mask a genuinely wrong shape elsewhere. Errors continue to surface through the existing `node:assert` machinery and through `tsc`'s exit code.

---

## Task 1: Narrow the parsed `engine.halted` event at the failing read site

### Overview
Make `.length` type-check at `tests/cli/iteration-too-fast.test.ts:152` by casting the indexed event to an array-bearing shape, preserving the optional chain and the assertion's expected value, message, and semantics.

### Changes Required
**File**: `tests/cli/iteration-too-fast.test.ts`
**Changes**: At line 152, replace the member access on the `unknown` field with an inline cast to `{ failed_cycles?: unknown[] }`:

```ts
// before
assert.deepEqual(halts[0].failed_cycles?.length, 1, "one failed cycle recorded");

// after
assert.deepEqual(
  (halts[0] as { failed_cycles?: unknown[] }).failed_cycles?.length,
  1,
  "one failed cycle recorded",
);
```

Notes:
- The cast targets only the indexed element at this site; `readEvents`, the `halts` `filter` (lines 147–149), the `halts.length` pin (line 150), and the `threshold` assertion (line 151) are untouched.
- The expected value (`1`) and message (`"one failed cycle recorded"`) are unchanged.
- The `?.` optional chain is retained verbatim.

### Success Criteria
- [ ] `npm run typecheck` exits 0 and prints no `TS2339` diagnostic.
- [ ] `npm test` passes, including the `iteration-too-fast` suite; line 152 still asserts exactly one failed cycle recorded.
- [ ] `git diff --name-only` lists only `tests/cli/iteration-too-fast.test.ts`.
- [ ] The `?.` optional chain is intact at the edited site (a missing `failed_cycles` compares `undefined` to `1` and fails, rather than throwing or silently passing) — verifiable by reading the assertion.
- [ ] No blanket `as any`; the cast narrows to `{ failed_cycles?: unknown[] }` (honest array-bearing shape).
- [ ] No new compiler/linter warnings introduced anywhere.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Running npm run typecheck exits 0 and prints no TS2339 diagnostic (user-observable benefit: the typecheck gate is green again).` | Task 1 | Cast resolves the sole TS2339 site. |
| `[ ] Running npm test passes, including the iteration-too-fast suite, with the line-152 assertion still checking that exactly one failed cycle was recorded.` | Task 1 | Expected value/message/semantics unchanged. |
| `[ ] git diff shows changes confined to tests/cli/iteration-too-fast.test.ts (no src/**, no gate-script changes).` | Task 1 | Single-line edit in one file. |
| `[ ] Failure-path: if the parsed event's failed_cycles were absent, the assertion compares undefined to 1 and fails (the ?. optional chain is retained) rather than throwing a TypeError or silently passing — verifiable by reading the assertion and confirming the optional chain is intact.` | Task 1 | `?.` preserved verbatim. |
| `[ ] All existing tests still pass.` | Task 1 | Full `npm test` run in Testing Strategy. |
| `[ ] No compiler/linter warnings introduced.` | Task 1 | `tsc --noEmit` clean; no new warnings. |

---

## Testing Strategy

### Unit Tests
- No new unit tests. This repairs a static-typing defect in an existing test and changes no runtime behavior.
- Failure-path verification is by inspection: confirm the `?.` optional chain remains at the edited site so a runtime-absent `failed_cycles` yields `undefined` and the existing `assert.deepEqual(undefined, 1, …)` fails loudly. No new runtime failure surface is introduced, so there is nothing new to exercise with a test.
- Mocking strategy: none — the change is compile-time only.

### Integration / E2E Tests
- Static gate (primary deliverable): `npm run typecheck` → expect exit 0, no `TS2339`.
- Full suite regression: `npm test` (auto-builds via `pretest`) → expect green, including the test "iteration-too-fast: K=2 instant failures fast-bail with exactly one warning, no third retry" (`tests/cli/iteration-too-fast.test.ts:104`) which exercises line 152.
- Scope check: `git diff --name-only` → expect only `tests/cli/iteration-too-fast.test.ts`.
- No UI is involved; no browser/E2E applies.

## Risk Assessment
- **Cast hides a genuinely different runtime shape**: mitigated by narrowing to `{ failed_cycles?: unknown[] }` (element type stays `unknown`) and retaining `?.`, so a missing/non-array `failed_cycles` still collapses to `undefined` and fails the assertion rather than passing falsely.
- **Edit accidentally alters assertion semantics**: mitigated by preserving the expected value (`1`) and message verbatim and limiting the change to wrapping the receiver in a cast; the count pin and threshold assertion on adjacent lines are untouched.
- **Reformatting line 152 introduces lint noise**: mitigated by matching the file's existing multi-line `assert.deepEqual` style (as at lines 153–157) so the formatting is consistent with surrounding code.
