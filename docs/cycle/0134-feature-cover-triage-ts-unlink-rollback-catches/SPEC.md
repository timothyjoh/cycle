I have all the context needed. Writing the SPEC now.

# SPEC — Cycle 0134: Cover triage.ts Unlink-Rollback Catches via TriageDeps Fault Injection

## Objective
Close the final two uncovered lines in `src/engine/triage.ts` by adding fault-injection tests for the two best-effort `unlink` catch blocks: the rollback in `applyRaw` (fires when a partially-applied todo needs cleanup) and the tmp-file cleanup in `atomicWrite` (fires when an earlier step threw and the tmp unlink also throws). Both guards protect the only writer that mutates `tbd.jsonl` and moves files out of `raw/` — exercising them proves the engine handles double-fault scenarios without corrupting queue state.

## Source Issue
`refl-0049-triage-ts-605-606-and-632-633-uncovered` — "Cover triage.ts unlink-rollback catches (605-606, 632-633) via fs.promises.unlink fault injection"

## Scope

### In Scope
- Add `unlink` injectable to `TriageDeps` and thread it through `applyRaw` and `atomicWrite`, following the DI convention established by cycle 0133
- Two new tests in `tests/engine/triage.faults.test.ts` — one per catch block

### Out of Scope
- Changing rollback semantics, error wrapping, or logging strategy in the catch blocks beyond what the DI seam mechanically requires
- Extending `FLOORS` in `scripts/coverage-gate.mjs` (floor already ≥ 95%; no new entries)
- Introducing any fault-injection style other than `TriageDeps` DI

## Requirements
- `TriageDeps` gains an optional `unlink?: (path: string) => Promise<void>` field; production call sites pass `undefined` (falls through to `fs/promises.unlink`)
- `applyRaw` and `atomicWrite` consume the injectable; tests supply a throwing stub
- No observable change to any success path

## Acceptance Criteria
- [ ] `TriageDeps` extended with optional `unlink` field in `src/engine/triage.ts`
- [ ] `applyRaw` rollback unlink catch covered: rename succeeds, injected `unlink(todoPath)` throws; error is swallowed; queue state identical to success path (no half-mutation of `tbd.jsonl`)
- [ ] `atomicWrite` tmp-cleanup catch covered: rename throws, injected `unlink(tmp)` also throws; original rename error propagates to caller unchanged
- [ ] `npm run test:coverage` LCOV shows DA for both unlink lines and both catch lines with non-zero hit count in `src/engine/triage.ts`
- [ ] All existing tests still pass
- [ ] `npm run typecheck` passes with zero errors

## Testing Strategy
- Node built-in test runner (`node:test`) — matches existing `triage.faults.test.ts` convention
- Test for `applyRaw` rollback: arrange a real repo fixture with one raw issue; configure `deps.unlink` to throw `ENOSPC` after the rename succeeds; assert `runTriage` returns `ok`, todo file absent, `tbd.jsonl` does not contain the partial row
- Test for `atomicWrite` cleanup: call `applyRaw` via `runTriage` with `deps.unlink` throwing on any path and `rename` configured to fail first; assert original error propagates (not the swallowed unlink error)
- Both tests reuse existing `setupRepo()` / `makeConfig()` / `makeLog()` helpers from `triage.faults.test.ts`

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: no changes — DI convention already established; no new commands
- **README.md**: no user-facing change
- **docs/ENGINE.md**: add one sentence under triage's rollback section noting both unlink catch blocks are tested via `TriageDeps.unlink` fault injection

## Dependencies
- Cycle 0133 must be merged: `TriageDeps` DI convention must already exist in the codebase
- No external services or env vars required
