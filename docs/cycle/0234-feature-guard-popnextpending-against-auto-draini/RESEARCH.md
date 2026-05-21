# Research: Cycle 0234

## Cycle Context

Cycle 0234 adds a hold gate to `popNextPending` in `src/engine/queue.ts` so that rows with `priority: "discuss"` are never auto-executed by the engine. Currently `discuss` sits at position `4` in `PRIORITY_ORDER` — last but still executable. The fix filters `discuss` rows from the candidate set entirely before the unblocked-row scan, causing `popNextPending` to return `null` (queue stall) when all remaining pending rows are `discuss`-priority. Two tests are required: an all-discuss stall case and a mixed-priority skip case. A note in `docs/ENGINE.md` is also required.

## Current Codebase State

### Relevant Components

- **`Priority` type**: `"low" | "medium" | "high" | "critical" | "discuss"` — `src/engine/queue.ts:6`
- **`PRIORITY_ORDER` constant**: `{ critical: 0, high: 1, medium: 2, low: 3, discuss: 4 }` — `src/engine/queue.ts:8-10`
- **`popNextPending` function**: reads the queue, builds sorted pending list, scans for first unblocked row — `src/engine/queue.ts:161-172`
- **`isQueueRow` validator**: accepts `"discuss"` as a valid `priority` value — `src/engine/queue.ts:59-60`
- **`normalizePriority`**: passes `"discuss"` strings through unchanged — `src/engine/queue.ts:13`
- **Engine drain loop**: calls `popNextPending` and breaks on `null` — `src/cli.ts:432-433`

### `popNextPending` — full current implementation

```
src/engine/queue.ts:161-172
```

```typescript
export async function popNextPending(repoRoot: string): Promise<QueueRow | null> {
  const rows = await readQueue(repoRoot);
  const allIds = new Set(rows.map((r) => r.id));
  const pending = rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  for (const row of pending) {
    const blocked = row.depends_on.some((dep) => allIds.has(dep) && dep !== row.id);
    if (!blocked) return row;
  }
  return null;
}
```

The function sorts by `PRIORITY_ORDER` value ascending. `discuss` (value `4`) lands last. There is no filter — all `pending` rows, including `discuss`, are included in `pending` before the unblocked scan.

### Engine drain loop call site

`src/cli.ts:421-433`:

```typescript
while (!halted) {
  if (cfg && (await rawHasFiles())) {
    const r = await runTriage(cwd, cfg, log);
    // ...
  }
  const row = await popNextPending(cwd);
  if (!row) break;
  // ...
}
```

A `null` return from `popNextPending` exits the drain loop cleanly. This is already the documented stall mechanism for dependency deadlock and empty queue. The new `discuss` stall uses the same path.

### `discuss` routing in the rest of the system

- **Triage** (`src/engine/triage.ts:194-196`): raws with `priority: "discuss"` are intercepted by `parkForDiscussion` and moved to `docs/cycle/issues/discuss/` — they are never appended to `tbd.jsonl`.
- **Reflection** (`src/engine/reflection.ts:179`): `discuss`-bucket sharp edges are written to `docs/cycle/issues/raw/` with `priority: discuss`. They become new raws that will be processed by the next triage run, where the triage guard routes them to `discuss/`.
- **`docs/ENGINE.md` Queue section (line 48)**: documents that `discuss`-priority raws are intercepted by triage before queuing, and never reach `tbd.jsonl` via the normal triage path.

Despite this, `isQueueRow` accepts `discuss` as a valid `priority` on a `QueueRow`, meaning a `discuss` row can validly appear in `tbd.jsonl` (e.g., hand-written, migrated, or written by a future path). The guard is defensive coverage.

### Existing test at `tests/engine/queue.test.ts:438-450`

```typescript
test("popNextPending: discuss is last priority", async () => {
  // queue: D (discuss) + M (medium)
  // currently returns M because discuss sorts last (order 4 > 2)
});
```

This test exercises the mixed-priority case and currently passes because `discuss` sorts to the back. After the guard is added, this test still passes — but for the new reason: `discuss` is filtered entirely. This pre-existing test implicitly validates the mixed-priority acceptance criterion from SPEC.md. The planner should note whether to leave this test as-is or update its description to reflect the guard semantics.

### Existing test infrastructure

**Test file**: `tests/engine/queue.test.ts` — 507 lines, no separate module, all tests use `node:test`.

**Helper functions in `tests/engine/queue.test.ts`**:

- `setupRoot()` (line 22-26): creates a `mkdtemp` temp dir with `.cycle/` subdirectory; returns the root path
- `row(id, overrides)` (line 28-39): factory for `QueueRow` with defaults `status: "pending"`, `priority: "medium"`, `attempt: 0`, `depends_on: []`

Pattern for new tests (consistent with existing tests at line 186-506):

```typescript
test("popNextPending: ...", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [...]);
    const next = await popNextPending(root);
    assert.equal(next?.id, "...");  // or assert.equal(next, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

No mocking framework is used. All queue tests use real JSONL files in temp directories.

**Imports already present in `tests/engine/queue.test.ts`** (line 1-20):
`mkdtemp`, `mkdir`, `writeFile`, `readFile`, `rm`, `stat`, `chmod` from `node:fs/promises`; all queue exports including `popNextPending`, `writeQueue`, `readQueue`, `QueueRow`, `Priority`.

### Coverage

Per-file floor for `src/engine/queue.ts`: **branch ≥ 90%** — `scripts/coverage-gate.mjs:28`. The new branch in `popNextPending` (the filter predicate) must be covered by the new tests.

### ENGINE.md queue section

`docs/ENGINE.md` lines 29-48 — the Queue section. The existing `discuss` note at line 48 describes triage interception:

> **Note on `discuss` priority:** Raws with `priority: discuss` are routed to `docs/cycle/issues/discuss/` by the triage loop before the agent is called — they are never queued.

The SPEC requires a new note added to this section documenting the `popNextPending` hold gate.

## Code References

- `src/engine/queue.ts:6` — `Priority` type union including `"discuss"`
- `src/engine/queue.ts:8-10` — `PRIORITY_ORDER` constant; `discuss: 4`
- `src/engine/queue.ts:13` — `normalizePriority` pass-through for `"discuss"`
- `src/engine/queue.ts:59-60` — `isQueueRow` accepts `"discuss"` as valid priority
- `src/engine/queue.ts:161-172` — `popNextPending` — the function being modified
- `src/cli.ts:432-433` — only call site of `popNextPending` in the engine drain loop
- `src/engine/triage.ts:194-196` — `parkForDiscussion` guard (routes discuss raws before queuing)
- `src/engine/reflection.ts:179` — reflection writes discuss-bucket issues with `priority: "discuss"`
- `tests/engine/queue.test.ts:22-39` — `setupRoot` and `row` helper factories
- `tests/engine/queue.test.ts:186-506` — existing `popNextPending` tests; new tests append after line 506
- `tests/engine/queue.test.ts:438-450` — pre-existing "discuss is last priority" test; covers mixed case but for the wrong reason post-change
- `docs/ENGINE.md:29-48` — Queue section; line 48 is the existing `discuss` note to be extended
- `scripts/coverage-gate.mjs:28` — `"src/engine/queue.ts": 90` branch floor

## Open Questions

- The pre-existing test `"popNextPending: discuss is last priority"` at line 438-450 will continue to pass after the change (mixed case, medium is returned), but its name and comment describe ordering semantics, not the guard. The planner should decide whether to rename/update this test's description or add a new named test alongside it for explicitness.
- SPEC requires the guard to be documented with an inline comment naming the stopgap and referencing `redesign-05-discuss-folder-lifecycle`. The planner should confirm exact wording and placement (inside the filter callback vs. above the `pending` assignment).
