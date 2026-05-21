# Research: Cycle 0235

## Cycle Context

Cycle 0235 adds a single focused test to `tests/engine/queue.test.ts` covering the `priority_hint`-only normalization branch in `readQueue`. The normalization pre-pass at `src/engine/queue.ts:84` resolves priority via `o.priority ?? o.priority_hint`, which correctly handles legacy queue rows carrying only `priority_hint`. No test currently exercises this branch — only rows with both fields present (or neither) are covered. The cycle adds one test asserting that a row written with `priority_hint: 'high'` and no `priority` field is read back with `priority: 'high'` and no `priority_hint` field.

## Current Codebase State

### Relevant Components

- **`readQueue` normalization pre-pass**: `src/engine/queue.ts:82–86` — iterates parsed lines; for any object, sets `o.priority = normalizePriority(o.priority ?? o.priority_hint)` then `delete o.priority_hint`. The `??` means when `o.priority` is `undefined`, it falls back to `o.priority_hint`. This is the uncovered branch.
- **`normalizePriority`**: `src/engine/queue.ts:12–21` — accepts `unknown`; string enum values pass through unchanged; numeric values bucket to enum; all other values return `"medium"`. When called with `"high"` (a valid enum string), returns `"high"`.
- **`isQueueRow` guard**: `src/engine/queue.ts:50–62` — validates that `priority` is one of the five enum values. A row with no `priority` field (only `priority_hint`) fails this guard before normalization runs — but normalization at line 84 sets `o.priority` first, then `isQueueRow` is checked at line 87, so the guard sees the normalized value.
- **`setupRoot` helper**: `tests/engine/queue.test.ts:22–26` — creates a `mkdtemp` directory and `.cycle/` subdirectory, returns the root path.
- **`row` helper**: `tests/engine/queue.test.ts:28–39` — creates a valid `QueueRow` with defaults; does not set `priority_hint` (it constructs the TypeScript type directly).
- **Existing `readQueue` normalization tests**: `tests/engine/queue.test.ts:377–419` — two tests covering: (1) a row with both `priority: 3` and `priority_hint: 'high'` (numeric priority wins, `priority_hint` stripped); (2) a row with no priority field at all (defaults to `"medium"`). Neither test exercises `priority_hint`-only (i.e., `priority` absent, `priority_hint` present).
- **Test file imports**: `tests/engine/queue.test.ts:1–20` — imports `readQueue`, `writeQueue`, `appendRow`, etc. from `../../src/engine/queue.ts`. `writeFile` is imported from `node:fs/promises` at line 3.

### Existing Patterns to Follow

- **Raw JSONL write pattern**: The existing normalization test at line 378 uses `JSON.stringify({...})` + `await writeFile(join(root, ".cycle/tbd.jsonl"), line + "\n", "utf8")` to seed raw content that bypasses the `QueueRow` type system, allowing fields that `writeQueue` would reject.
- **`setupRoot` + `finally` cleanup**: Every async test uses `const root = await setupRoot()` then `try { ... } finally { await rm(root, { recursive: true, force: true }) }`.
- **`assert.ok(!("priority_hint" in rows[0]), ...)` pattern**: The existing test at line 395 uses this idiom to assert field absence — already the established pattern for this assertion.
- **Test naming convention**: Descriptive string prefixed with the function under test: `"readQueue: <description>"`.
- **No mock usage for `node:fs/promises`**: Per `CLAUDE.md`, `node:fs/promises` properties are non-configurable in ESM; all existing queue tests use real filesystem operations.
- **Placement**: New normalization tests belong in the `// readQueue normalization tests` block, currently spanning lines 377–419, before the `// popNextPending priority sort tests` block starting at line 421.

### Dependencies & Integration Points

- `src/engine/queue.ts` — production module under test; no changes required this cycle.
- `node:fs/promises` — `writeFile` already imported at `tests/engine/queue.test.ts:3`; no new imports needed.
- `node:path` `join` — already imported at line 5.
- `node:os` `tmpdir` — already imported at line 4.
- `node:test` `test` — already imported at line 1.
- `node:assert` `strict as assert` — already imported at line 2.

### Test Infrastructure

- **Framework**: Node built-in `node:test` runner; `node:assert` strict mode.
- **Build**: `npm test` runs `pretest` (esbuild build) then the suite. `npm run test:coverage` produces LCOV; `npm run check:coverage` enforces per-file floors.
- **Coverage floor for `src/engine/queue.ts`**: 90% line coverage — enforced by `scripts/coverage-gate.mjs`.
- **Test file**: `tests/engine/queue.test.ts` — 524 lines, 30+ tests, all using the real filesystem.
- **Existing coverage of normalization path**: Lines 82–86 in `queue.ts` are exercised by the two existing normalization tests at lines 378 and 401. The `o.priority ?? o.priority_hint` expression is evaluated in both, but the `priority_hint`-only branch (where `o.priority` is `undefined`) is not hit by any current test.

## Code References

- `src/engine/queue.ts:84` — `o.priority = normalizePriority(o.priority ?? o.priority_hint);` — the uncovered branch when `o.priority` is absent
- `src/engine/queue.ts:85` — `delete o.priority_hint;` — must be asserted absent in the new test
- `src/engine/queue.ts:12–21` — `normalizePriority` — passes `"high"` through unchanged
- `src/engine/queue.ts:50–62` — `isQueueRow` — requires `priority` to be valid enum after normalization
- `tests/engine/queue.test.ts:377–419` — existing `readQueue` normalization tests; new test slots in here
- `tests/engine/queue.test.ts:22–26` — `setupRoot` helper
- `tests/engine/queue.test.ts:378–399` — closest analog: numeric+priority_hint test — exact structure to follow for the new test

## Open Questions

None. The SPEC is unambiguous: one test, specified structure, specified assertions, specified placement. All infrastructure is in place.
