# SPEC — Cycle 0243: Mirror discuss-priority guard from runTriage into dryRunTriage

## Objective
`dryRunTriage` currently invokes the triage agent for every raw file, including those marked `priority: discuss`. The live `runTriage` skips agent invocation for discuss raws — it calls `parkForDiscussion` and `continue`s before the agent call. This divergence makes `--dry-run` output misleading: operators debugging a paused queue see agent invocations that would never happen on the next live run. This cycle closes the gap by adding the same discuss guard to `dryRunTriage` and covering it with a test.

## Source Issue
`refl-0228-dryruntriage-processes-discuss-raws-as-n` — "Mirror discuss-priority guard from runTriage into dryRunTriage"

## Scope

### In Scope
- Add `priority === 'discuss'` skip guard in `dryRunTriage` (`src/engine/triage.ts`), immediately before the `processRawWithRetry` call, mirroring the guard in `runTriage`
- Add a test in `tests/engine/triage-dry-run.test.ts` asserting that `dryRunTriage` does not invoke the agent for a discuss-priority raw and returns no report entry for it

### Out of Scope
- Changing `parkForDiscussion` behavior or the live `runTriage` path (those are already correct)
- Emitting `issue.parked_for_discussion` events from `dryRunTriage` (dry-run produces no side effects; the skip is silent)
- Any changes to the CLI `--dry-run` output format

## Requirements
- `dryRunTriage` must skip `processRawWithRetry` for any raw whose `fm.priority === 'discuss'`
- The skipped raw must not appear in the returned `DryRunReport[]` array
- The guard must be placed at the same logical position as in `runTriage`: after `raw` is loaded from `raws`, before the `processRawWithRetry` call
- No new dependencies or imports required; the guard is a single `continue` statement inside the existing `for` loop
- `src/engine/triage.ts` line coverage must remain ≥ 95% after the change

## Acceptance Criteria
- [ ] `dryRunTriage` called with a single `priority: discuss` raw returns an empty `DryRunReport[]` and never calls `runAgent`
- [ ] `dryRunTriage` called with a mixed batch (one discuss, one normal) calls `runAgent` exactly once (for the normal raw) and returns exactly one report entry
- [ ] `npm test` passes with no regressions
- [ ] `npm run typecheck` exits zero with no new errors
- [ ] `npm run test:coverage && npm run check:coverage` passes with `src/engine/triage.ts` at ≥ 95% line coverage
- [ ] `npm run check:invariants` passes

## Testing Strategy
- Test framework: `node:test` with `node:assert/strict`, consistent with `tests/engine/triage-dry-run.test.ts`
- Add two new tests to `tests/engine/triage-dry-run.test.ts`:
  1. **Single discuss raw**: write one raw with `priority: discuss`, call `dryRunTriage`, assert `reports.length === 0` and `agentCallCount === 0`
  2. **Mixed batch**: write one discuss raw and one normal raw, call `dryRunTriage`, assert `reports.length === 1`, `reports[0].raw_id` equals the normal raw's id, and `agentCallCount === 1`
- Reuse the existing `setupRepo` helper and `TriageDeps` stub pattern already present in the file

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes
- **README.md**: No user-facing change
- **docs/ENGINE.md**: If the ENGINE.md `dryRunTriage` section describes its behavior, add a note that discuss-priority raws are skipped (same as live triage)

## Dependencies
- `dryRunTriage` and `TriageDeps` are already exported from `src/engine/triage.ts`
- No new env vars or external services required
