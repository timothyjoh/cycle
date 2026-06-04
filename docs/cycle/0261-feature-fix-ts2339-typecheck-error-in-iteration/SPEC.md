# SPEC — Cycle 0261: Repair the red `tsc --noEmit` gate (TS2339 in iteration-too-fast.test.ts)

## WHY
`npm run typecheck` currently exits non-zero. The repo-wide TypeScript gate is red because of a single error:

```
tests/cli/iteration-too-fast.test.ts(152,46): error TS2339: Property 'length' does not exist on type '{}'
```

The offending line is `assert.deepEqual(halts[0].failed_cycles?.length, 1, …)`. `readEvents` returns `Array<Record<string, unknown>>`, so `halts[0].failed_cycles` is `unknown`; the optional-chained `.length` does not narrow and `tsc` rejects it. CLAUDE.md mandates that `tsc --noEmit` be clean ("no warnings allowed"). A persistently red gate is corrosive: it masks any *new* type error a future cycle introduces in this or any other file, because the gate is already failing and the new error blends into the noise. This was confirmed pre-existing on clean `HEAD` (origin cycle 0260 BUILD.md / REVIEW.md), so it is a genuine follow-up rather than a regression.

## CONCRETE USER BENEFIT
A developer (or the engine's own `build`/`fix` step) running `npm run typecheck` after this cycle sees exit code `0` with no diagnostics, instead of a TS2339 failure. The typecheck gate becomes a trustworthy signal again: a green run now means the tree is type-clean, so the next type error anyone introduces will actually be caught instead of hidden behind this standing failure.

## USABLE END-STATE
`npm run typecheck` passes cleanly (exit 0, zero diagnostics) on `master`. `npm test` continues to pass with the `iteration-too-fast` suite asserting exactly the same behavior it did before — only the static type of the parsed event at the read site changes. No runtime behavior, no assertion semantics, and no engine code change.

## Objective
This cycle restores the repo-wide TypeScript gate to green by giving the parsed `engine.halted` event a precise enough type at one read site in `tests/cli/iteration-too-fast.test.ts` that `.failed_cycles?.length` type-checks. The change is typing-only: the assertion's observable semantics ("exactly one failed cycle recorded") are preserved byte-for-byte. It matters because a red `tsc --noEmit` gate violates a hard project convention and silently defeats type checking for every subsequent change.

## Source Issue
`refl-0260-fix-ts2339-typecheck-error-in-iteration` — "Fix TS2339 typecheck error in iteration-too-fast.test.ts"

## Scope

### In Scope
- Annotate or narrow the parsed `engine.halted` event at `tests/cli/iteration-too-fast.test.ts:152` (e.g. treat `failed_cycles` as `unknown[]` via a local typed view such as `(halts[0] as { failed_cycles?: unknown[] }).failed_cycles?.length`, or an equivalent assertion of the array shape) so `.length` is valid under `tsc --noEmit`.

### Out of Scope
- Any change to engine source (`src/**`), the `engine.halted` payload shape, or the structural-invariants / coverage gates.
- `refl-0246` (a TS2345 error in `src/**`) — a separate, distinct error; do not touch it or conflate the two.
- Broadening the `readEvents` return type or refactoring the test's event-parsing helper beyond what is needed to satisfy this one diagnostic. Keep the blast radius to the single read site (or the minimal shared typing required for it).
- Changing any assertion's expected value, message, or count.

## Requirements
- After the change, `npm run typecheck` exits 0 with no TS2339 (and introduces no new diagnostic anywhere).
- The assertion at line 152 still verifies that exactly one failed cycle is recorded (`failed_cycles.length === 1`) with the same failure message.
- The fix is typing-only: no change to runtime control flow, spawned subprocesses, or test fixtures.
- The added type must be honest — narrow `unknown`/`Record<string, unknown>` to an array-bearing shape (e.g. `{ failed_cycles?: unknown[] }`); do not silence the error with a blanket `as any` that discards all type information at the site.
- **Failure behavior**: This is a test-side typing change with no new runtime failure surface. The relevant failure mode is the static gate itself: if `failed_cycles` is absent or not an array at runtime, the typing must not assert otherwise in a way that converts a real `undefined` into a false pass — the optional chain (`?.`) must be preserved so a missing `failed_cycles` still yields `undefined` (and the `deepEqual(undefined, 1)` assertion fails loudly) rather than throwing or silently passing. Errors surface through the existing assertion; nothing is swallowed.

## Acceptance Criteria
- [ ] Running `npm run typecheck` exits 0 and prints no `TS2339` diagnostic (user-observable benefit: the typecheck gate is green again).
- [ ] Running `npm test` passes, including the `iteration-too-fast` suite, with the line-152 assertion still checking that exactly one failed cycle was recorded.
- [ ] `git diff` shows changes confined to `tests/cli/iteration-too-fast.test.ts` (no `src/**`, no gate-script changes).
- [ ] Failure-path: if the parsed event's `failed_cycles` were absent, the assertion compares `undefined` to `1` and fails (the `?.` optional chain is retained) rather than throwing a TypeError or silently passing — verifiable by reading the assertion and confirming the optional chain is intact.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Framework: the repo's existing `node:test` suite run via `npm test` (auto-builds first) plus `npm run typecheck` for the static gate.
- Key scenarios:
  - Happy path: `iteration-too-fast` test still passes with unchanged assertions.
  - Static gate: `npm run typecheck` is clean — the primary deliverable.
  - Regression: full `npm test` run confirms no other suite is affected by the typing change.
- No new tests are required; this repairs a static-typing defect in an existing test and changes no runtime behavior. No UI is involved, so no E2E tests apply.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention or command changes — none required.
- **README.md**: No user-facing surface changes — none required.

This is a typing-only repair of a test file; there is no documented behavior to update. Stating that explicitly is the documentation deliverable for this cycle.

## Dependencies
- Existing repo toolchain: Node ≥ 22.6, `tsc` via `npm run typecheck`, the `node:test` suite via `npm test`.
- The `engine.halted { reason: "max_consecutive_failures", threshold, failed_cycles }` event must continue to emit `failed_cycles` as an array — already true in current engine source; this cycle relies on it but does not modify it.
- No external services or environment variables required.
