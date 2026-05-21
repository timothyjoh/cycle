# SPEC — Cycle 0236: Thread artifactDir into CommitCycleOpts

## Objective

This cycle eliminates the fragile `readdir` prefix-scan in `commitCycle` by threading the already-computed `artifactDir` through `CommitCycleOpts`. Currently `commitCycle` re-discovers the cycle artifact directory by scanning `docs/cycle/` for the first entry matching `${cycleId}-*`, which silently produces an empty footprint when `docs/cycle/` does not yet exist and is susceptible to non-deterministic matching when multiple directories share the same cycle ID prefix. Since `run-cycle.ts` already holds `artifactDir` and the two `commitCycle` call sites in `cli.ts` have access to the value returned by `runCycle`, the fix is a direct threading change with no new infrastructure.

## Source Issue

`refl-0227-commitcycle-re-discovers-artifactdir-via` — "Thread artifactDir into CommitCycleOpts to eliminate independent re-discovery"

## Scope

### In Scope

- Add `artifactDir?: string` field to `CommitCycleOpts` in `src/engine/commit-cycle.ts`
- Replace the `readdir` scan (lines 142–149) with a direct `join(opts.artifactDir, "touched.json")` read, removing all directory-scan fallback logic
- Surface `artifactDir` from `runCycle`'s return type and forward it from both `commitCycle` call sites in `src/cli.ts`
- Add a regression test asserting no spurious `commit.scope_warning` when `artifactDir` is supplied but `docs/cycle/` does not exist

### Out of Scope

- Changes to `touched.json` accumulation logic in `run-cycle.ts`
- Any other `CommitCycleOpts` fields or commit behavior
- Modifications to the `parseTouchedFiles` function

## Requirements

- `CommitCycleOpts.artifactDir` is an optional `string` field; absence must preserve the existing silent-skip behavior (no warning emitted, no crash)
- The `readdir` import and the directory-scan block at lines 142–149 are fully removed — no scan path must remain in the file
- `runCycle` return type must include `artifactDir: string` so call sites can access it without re-computing the path
- Both `commitCycle` call sites in `src/cli.ts` must pass `artifactDir` from the `runCycle` result
- Coverage for `src/engine/commit-cycle.ts` must remain at or above the 95% per-file floor

## Acceptance Criteria

- [ ] `CommitCycleOpts` in `src/engine/commit-cycle.ts` declares an `artifactDir?: string` field
- [ ] The `readdir` call and the `entries.find(e => e.startsWith(...))` block are absent from `commit-cycle.ts`
- [ ] `runCycle` return type exposes `artifactDir: string` in both `"ok"` and `"failed"` return shapes
- [ ] Both `commitCycle` invocations in `src/cli.ts` pass `artifactDir` from the `runCycle` result
- [ ] New regression test in `tests/engine/commit-cycle.test.ts` passes: a commit run with `artifactDir` pointing at a directory where `docs/cycle/` does not exist emits no `commit.scope_warning` event
- [ ] All existing `commit-cycle.test.ts` tests pass
- [ ] `npm run test:coverage` passes with `src/engine/commit-cycle.ts` line coverage ≥ 95%
- [ ] `npm run typecheck` reports zero errors

## Testing Strategy

- Framework: Node built-in test runner (`node:test`) matching existing `tests/engine/commit-cycle.test.ts` conventions
- New test scenario: construct a temp directory without a `docs/cycle/` subdirectory, call `commitCycle` with a valid `artifactDir` (a path that exists but has no `touched.json`), assert that no `commit.scope_warning` event is emitted and the result is `"skipped"` (nothing staged) rather than an error
- Existing tests must continue to pass without modification
- No mocking of `node:fs/promises` — use real temp directories per established convention (see CLAUDE.md test conventions)

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No convention changes required
- **docs/ENGINE.md**: Update the commit-lifecycle section to note that `touched.json` is now located via `CommitCycleOpts.artifactDir` rather than a directory scan; remove any reference to the `readdir` prefix-scan fallback

## Dependencies

- `src/engine/commit-cycle.ts` and `src/engine/run-cycle.ts` must be at the state landed in cycle 0227 (engine-owned `touched.json` and non-blocking scope warning) — confirmed present on `master`
- No external services or environment variables required
