# SPEC — Cycle 0090: Fix retry-skip gate: re-validate spec artifact against SPEC_MIN_BYTES before skipping

## Objective
The retry-skip gate in `runCycle` skips the `spec` step when `SPEC.md` exists with `> 0` bytes. This allows a below-threshold artifact (one that previously failed the `SPEC_MIN_BYTES = 200` post-condition guard) to persist and be silently reused on subsequent retry attempts, causing all downstream steps to operate on a stub error note rather than a real spec. This cycle fixes `shouldSkipForArtifact` to re-validate the `spec` artifact against `SPEC_MIN_BYTES` before deciding to skip, ensuring a below-threshold `SPEC.md` is treated as absent and the step re-runs.

## Source Issue
`refl-0087-retry-skip-policy-reuses-below-threshold` — "Fix retry-skip gate: re-validate spec artifact against SPEC_MIN_BYTES before skipping"

## Scope

### In Scope
- Extend `shouldSkipForArtifact` in `src/engine/run-cycle.ts` to read and measure `SPEC.md` content when `stepName === "spec"` and skip only if `Buffer.byteLength(content, "utf8") >= SPEC_MIN_BYTES`
- Add a regression test in `tests/engine/` verifying that a below-threshold `SPEC.md` on a retry pop does not emit `step.skipped` for spec

### Out of Scope
- Deleting or renaming the below-threshold artifact (it is overwritten on re-run; no cleanup needed)
- Applying a byte-floor gate to `research` or `plan` steps (no post-condition floor exists for them)
- Any queue schema changes

## Requirements
- When `shouldSkipForArtifact` evaluates the `spec` step and finds `SPEC.md` with `> 0` bytes, it must additionally read the file and check `Buffer.byteLength(content, "utf8") >= SPEC_MIN_BYTES` before returning `{ skip: true }`
- If the measured byte length is `< SPEC_MIN_BYTES`, the function returns `{ skip: false }` (artifact treated as absent)
- ENOENT and unreadable errors during the read must be caught and treated as absent (fall through to `{ skip: false }`)
- `research` and `plan` skip semantics (`> 0` bytes only) must remain unchanged
- `SPEC_MIN_BYTES` and `formatSpecGuardError` are already exported — reuse them; do not duplicate the constant

## Acceptance Criteria
- [ ] `shouldSkipForArtifact("spec")` returns `{ skip: false }` when `SPEC.md` exists but contains fewer than 200 bytes
- [ ] `shouldSkipForArtifact("spec")` returns `{ skip: true }` when `SPEC.md` exists and contains 200 or more bytes
- [ ] `shouldSkipForArtifact("research")` and `shouldSkipForArtifact("plan")` behavior is unchanged (skip when `> 0` bytes)
- [ ] A regression test in `tests/engine/` exercises the below-threshold branch and asserts no `step.skipped` event for `spec`
- [ ] `npm test` passes with no coverage regressions (line ≥ 95%, branch ≥ 75%, function ≥ 90%)
- [ ] All existing tests still pass

## Testing Strategy
- Node native test runner (`node:test`) — same framework used throughout `tests/engine/`
- Unit-test `shouldSkipForArtifact` directly: create a temp dir, write a `SPEC.md` of exactly 199 bytes, assert `skip: false`; write one of 200 bytes, assert `skip: true`
- Verify `research` and `plan` at 1 byte still return `skip: true` (no regression on existing semantics)
- No E2E cycle run needed — the fix is in a pure async function with no LLM calls

## Documentation Updates
- **CLAUDE.md**: Update the "Retry skip policy" architecture note to reflect that `spec` skipping additionally requires `>= SPEC_MIN_BYTES` (not just `> 0` bytes)
- **README.md**: No user-visible change; no update required

## Dependencies
- `SPEC_MIN_BYTES` exported from `src/engine/run-cycle.ts` (already present)
- Node `fs/promises` `readFile` (already used in the file)
