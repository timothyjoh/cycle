```markdown
# Research: Cycle 0197

## Cycle Context

Cycle 0196 added `documentation.paths_appended` log event emission to `appendDocumentationPaths` in `src/engine/run-cycle.ts`. The event payload is `{ cycle_id: string, appended: string[] }`. Test A ("documentation.paths_appended emitted when paths are appended") in `tests/engine/run-cycle.documentation.test.ts` only asserts `ev.appended` — it never asserts `ev.cycle_id`. Cycle 0197 adds that missing one-line assertion, completing the contract coverage.

## Current Codebase State

### Relevant Components

- **Production emit site**: `appendDocumentationPaths` emits `{ cycle_id: cycleId, appended: toAppend }` — `src/engine/run-cycle.ts:99`
- **Function signature**: `appendDocumentationPaths(repoRoot, buildMdPath, log, cycleId)` — `src/engine/run-cycle.ts:47`
- **Call site**: invoked inside the documentation step handler — `src/engine/run-cycle.ts:338`
- **Test A ("emit" case)**: `"documentation.paths_appended emitted when paths are appended"` — `tests/engine/run-cycle.documentation.test.ts:509–533`
  - Fixture `issueId`: `"PATHS-APPENDED-1"` — line 517
  - `expectExactlyOne` call: line 526 — `const ev = expectExactlyOne(events, "documentation.paths_appended");`
  - Existing `ev.appended` assertions: lines 527–528
  - **Missing**: `ev.cycle_id` assertion — nowhere in Test A
- **Test B ("no-emit" case)**: `"documentation.paths_appended not emitted when toAppend is empty"` — lines 535–558; asserts `absent.length === 0`; no payload fields to assert here
- **`expectExactlyOne` helper**: `tests/helpers.ts:3–10` — filters events by `event` name, asserts `length === 1`, returns the matched event object

### Existing Patterns to Follow

- **Payload field assertion pattern**: Callers access fields directly on the returned event object — `assert.equal(ev.cycle_id, "PATHS-APPENDED-1")` follows the same shape as `assert.equal(skipped.reason, "exec_failed")` at line 237 and `assert.equal(stepStart.head_sha, undefined)` at line 195
- **Placement convention**: Field assertions appear immediately after `expectExactlyOne`, before any type-cast access — see lines 194–196 (no_branch test), lines 236–238 (skipped test)
- **Cardinality rule (CLAUDE.md)**: Exactly-once events must use `expectExactlyOne` — already done; the new assertion is a field check on the same returned object, not a new cardinality check

### Dependencies & Integration Points

- No production code changes — `src/engine/run-cycle.ts` already emits `cycle_id` correctly at line 99
- No new imports needed — `assert` is already imported at `tests/engine/run-cycle.documentation.test.ts:2`
- No helper changes — `expectExactlyOne` already returns the full event object including `cycle_id`

### Test Infrastructure

- **Framework**: Node.js built-in `node:test` with `node:assert` strict mode
- **Helper**: `expectExactlyOne` from `tests/helpers.ts` — returns typed event object
- **Directory**: `tests/engine/` — integration tests using real `runCycle` with temp dirs and fake binaries
- **Run command**: `npm test` (triggers `npm run build` first via `pretest`); `npm run test:coverage` for coverage gates
- **Coverage gate script**: `scripts/coverage-gate.mjs` — enforces per-file floors; `tests/` files themselves are not under coverage floors

## Code References

- `src/engine/run-cycle.ts:47` — `appendDocumentationPaths` function signature (takes `log: Logger, cycleId: string`)
- `src/engine/run-cycle.ts:99` — `log.emit("documentation.paths_appended", { cycle_id: cycleId, appended: toAppend })`
- `src/engine/run-cycle.ts:338` — call site inside documentation step block
- `tests/engine/run-cycle.documentation.test.ts:509` — Test A begins
- `tests/engine/run-cycle.documentation.test.ts:517` — `issueId: "PATHS-APPENDED-1"` (the value that becomes `cycle_id` in the event)
- `tests/engine/run-cycle.documentation.test.ts:526` — `const ev = expectExactlyOne(events, "documentation.paths_appended");`
- `tests/engine/run-cycle.documentation.test.ts:527–528` — existing `ev.appended` assertions; new assertion inserts between line 526 and 527
- `tests/engine/run-cycle.documentation.test.ts:535` — Test B begins (no-emit case; no changes needed here)
- `tests/helpers.ts:3–10` — `expectExactlyOne` implementation

## Open Questions

None. The fixture value (`"PATHS-APPENDED-1"`), insertion point (after line 526), and assertion form (`assert.equal(ev.cycle_id, "PATHS-APPENDED-1")`) are all fully determined by the existing code.
```

Research complete. Key facts for the planner:

- **One file, one line**: insert `assert.equal(ev.cycle_id, "PATHS-APPENDED-1")` after `tests/engine/run-cycle.documentation.test.ts:526`
- Fixture `issueId` is `"PATHS-APPENDED-1"` (line 517), which flows through `runCycle` → `appendDocumentationPaths` → `log.emit` as `cycle_id`
- `assert` already imported; no new imports needed
- Production code at `run-cycle.ts:99` already emits `cycle_id` correctly — pure test gap
