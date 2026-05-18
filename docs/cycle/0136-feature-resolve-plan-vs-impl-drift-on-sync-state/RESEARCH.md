Enough to write the research doc. Outputting now.

```markdown
# Research: Cycle 0136

## Cycle Context

`scripts/sync-defaults.mjs` writes `.cycle/.sync-state.json` unconditionally on every run (line 123), including all-divergent runs where nothing is copied. Cycle 0048's PLAN.md specified a conditional write, creating a documented plan-vs-impl drift. Cycle 0136 resolves this drift via option 2: updating `docs/sync-defaults.md` to document the unconditional write behavior and the `{}` empty-body first-run shape. No code changes; no new tests.

## Current Codebase State

### Relevant Components

- **Sync-defaults doc**: Documents divergence guard, skip behavior, exit codes, force-overwrite — `docs/sync-defaults.md:1-23`
- **Sync-defaults script**: Implements divergence detection loop, writeStateAtomic call — `scripts/sync-defaults.mjs:1-135`
- **writeStateAtomic**: Atomic write via `.tmp` + rename — `scripts/sync-defaults.mjs:61-66`
- **Unconditional write site**: `await writeStateAtomic(state)` at line 123, outside any conditional, always executes after the loop regardless of skip count
- **State accumulation**: `state` is initialized by `loadState()` (line 95), entries only appended for copied files (line 119). On an all-divergent first run: `loadState()` returns `{}` (ENOENT path, line 47), loop adds nothing, `writeStateAtomic({})` writes `{}\n` to disk.
- **Test file**: 7 tests, all passing — `tests/defaults/sync-defaults-guard.test.ts:1-194`

### Existing Patterns to Follow

- **Doc language in `docs/sync-defaults.md`**: Present-tense declarative prose. No headers beyond H2. Inline code for paths/flags. Pattern: describe the behavior, then the output (stdout/stderr/exit code).
- **"When divergence is detected" block**: Lines 5-8 — bullet list of three behavioral facts. The new unconditional-write note should sit in or immediately after this block to be spatially collocated with the divergence behavior it qualifies.
- **SPEC points at `docs/sync-defaults.md` as the sole change target**: `SPEC.md:12-13` — "Add a section or inline note after the 'When divergence is detected' block"

### Dependencies & Integration Points

- `docs/sync-defaults.md` is referenced from `scripts/sync-defaults.mjs:11` (code comment: "See CLAUDE.md `### sync-defaults divergence guard`") and from `CLAUDE.md` which links to it
- No code imports the doc; it is operator-facing only
- `scripts/sync-defaults.mjs` must remain unchanged per SPEC — `SPEC.md:31`

### Test Infrastructure

- **Framework**: Node.js built-in `node:test` + `node:assert`
- **Test location**: `tests/defaults/sync-defaults-guard.test.ts`
- **Test helper pattern**: `seed(root, files)` writes fixture files; `runScript(root, opts)` calls `spawnSync` against the script with an isolated `cwd` — `tests/defaults/sync-defaults-guard.test.ts:10-25`
- **All-divergent first-run scenario**: NOT currently tested. Test 3 (line 81) covers one-divergent-of-three; no test seeds zero non-divergent paths. SPEC confirms no new tests required for this cycle.
- **Existing test that validates state on partial skip**: Lines 97-102 assert state contains only non-skipped paths; confirms `writeStateAtomic` is called (state file exists) even when some paths skipped.

## Code References

- `scripts/sync-defaults.mjs:61-66` — `writeStateAtomic`: atomic tmp+rename write of state JSON
- `scripts/sync-defaults.mjs:95` — `const state = await loadState()` — initial state; `{}` when no file
- `scripts/sync-defaults.mjs:100-121` — loop: only copied entries appended to `state`
- `scripts/sync-defaults.mjs:123` — `await writeStateAtomic(state)` — unconditional, the drift origin
- `docs/sync-defaults.md:5-8` — "When divergence is detected" block — insertion point for new text
- `docs/sync-defaults.md:10-18` — force-overwrite section — immediately follows the insertion point
- `tests/defaults/sync-defaults-guard.test.ts:81-106` — partial-divergent test; state file always written
- `tests/defaults/sync-defaults-guard.test.ts:151-174` — state-recording test; confirms skipped paths absent

## Open Questions

- The SPEC says "Add a section or inline note after the 'When divergence is detected' block" — both shapes (bullet appended to existing list vs. new prose paragraph) are consistent with the doc style. The planner should decide which fits more naturally given the existing list structure at lines 5-8.
- The existing doc comment in `scripts/sync-defaults.mjs:11` references "CLAUDE.md `### sync-defaults divergence guard`" but `CLAUDE.md` actually links to `docs/sync-defaults.md` rather than containing that section inline. The planner should verify whether the new content should also be reflected anywhere in `CLAUDE.md` or if the link to `docs/sync-defaults.md` is sufficient.
```
