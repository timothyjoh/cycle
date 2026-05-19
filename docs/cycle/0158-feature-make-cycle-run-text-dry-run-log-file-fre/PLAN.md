All open questions resolved. Writing the plan now.

**OQ1 (`ts:` field):** Include `ts: new Date().toISOString()` — SPEC requires "same event names and fields", `log.emit` always adds `ts`.

**OQ2 (stdout cleanliness):** After the move, `emitStaleDistWarning` and `engine.start` don't run in dry-run — stdout will contain only the dry-run JSON lines.

**OQ3 (new test vs assertion):** Add ENOENT assertion to the existing test at line 152 (the "second e2e" the SPEC refers to). No separate `test()` block needed — the scenario is already exercised there.

```markdown
# Implementation Plan: Cycle 0158

## Overview
Move the `--dry-run` short-circuit in `src/cli.ts` above `createLogger` so `cycle run "<text>" --dry-run` never writes `.cycle/log.jsonl`, matching `cycle drop` behavior. Update and extend the two affected tests in `tests/cli/multi-loop.test.ts`.

## Current State (from Research)
- `createLogger(cwd)` at `src/cli.ts:91` immediately calls `mkdir(".cycle")` and binds `appendFile` to `log.jsonl` — no lazy creation.
- The dry-run block at `src/cli.ts:385–397` uses `log.emit(...)` which dual-writes to file + stdout; it fires 400 lines below `createLogger`.
- `materializeFreeformIssue` at line 93 must precede the dry-run exit (SPEC requirement).
- `todoDir` is defined at line 97; needs to be inlined in the relocated dry-run block to avoid a forward-reference.
- Test at line 38 reads `log.jsonl` — must switch to parsing `r.stdout`.
- Test at line 152 already runs `run "park this too" --dry-run` but lacks a `log.jsonl` ENOENT assertion.

## Desired End State
- `cycle run "<text>" --dry-run` exits without creating `.cycle/` or `log.jsonl`.
- Dry-run stdout output: one `{ ts, event: "issue.ingested", issue_id, path }` per pending row, then `{ ts, event: "engine.stop", status: "ok", dry_run: true, cycles_processed: 0 }`.
- `materializeFreeformIssue` still writes the issue to `raw/` before exit.
- All 4 tests in `multi-loop.test.ts` pass; `npm test` clean; coverage floors hold.

## What We're NOT Doing
- Option B (documenting the asymmetry) — ruled out in SPEC.
- Changing `cycle drop` behavior — already correct.
- Adding `ts` to the `drop` handler's output — out of scope.
- Changing any other CLI subcommand.
- Adding a new top-level `test()` block (the SPEC's "second e2e test" is satisfied by an additional assertion in the existing text+dry-run test at line 152).

## Implementation Approach
Two-task vertical slice: (1) fix the source, (2) fix the tests. Each is independently verifiable. The dry-run block is rewritten inline using `console.log(JSON.stringify(...))` — same shape as `drop` handler. No new imports required (`readQueue` and `join` are already imported).

---

## Task 1: Relocate dry-run short-circuit in `src/cli.ts`

### Overview
Move the `if (args.dryRun)` block from lines 385–397 to immediately after `materializeFreeformIssue` (lines 93–95) and before `createLogger` (line 91). Rewrite it to use `console.log(JSON.stringify(...))` with explicit `ts:` field instead of `log.emit`. Remove the old block at its original location.

### Changes Required

**File**: `src/cli.ts`

**Step A — Remove `createLogger` from its current position and remove the old `if (args.text)` block.**
Current lines 91–95:
```typescript
const log = await createLogger(cwd);

if (args.text) {
  await materializeFreeformIssue(args.text, cwd);
}
```
Replace with:
```typescript
if (args.text) {
  await materializeFreeformIssue(args.text, cwd);
}

if (args.dryRun) {
  const rows = await readQueue(cwd);
  for (const row of rows) {
    if (row.status !== "pending") continue;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: "issue.ingested",
      issue_id: row.id,
      path: join(cwd, "docs/cycle/issues/todo", `${row.id}.md`),
    }));
  }
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event: "engine.stop",
    status: "ok",
    dry_run: true,
    cycles_processed: 0,
  }));
  process.exit(0);
}

const log = await createLogger(cwd);
```

**Step B — Remove the old dry-run block at lines 385–397.**
Delete:
```typescript
if (args.dryRun) {
  const rows = await readQueue(cwd);
  for (const row of rows) {
    if (row.status !== "pending") continue;
    const todoPath = join(todoDir, `${row.id}.md`);
    await log.emit("issue.ingested", { issue_id: row.id, path: todoPath });
  }
  await log.emit("engine.stop", {
    status: "ok",
    dry_run: true,
    cycles_processed: 0,
  });
  process.exit(0);
}
```

No import changes needed — `readQueue` and `join` are already imported; `console` is global.

### Success Criteria
- [ ] `tsc --noEmit` passes with no warnings
- [ ] `npm run build` succeeds
- [ ] Manual spot-check: `node dist/cycle.js run --dry-run` in a seeded temp dir prints JSON lines to stdout, no `.cycle/log.jsonl` created

---

## Task 2: Update tests in `tests/cli/multi-loop.test.ts`

### Overview
Fix the test at line 38 to parse stdout instead of `log.jsonl`, and add a `log.jsonl` ENOENT assertion there. Add the same ENOENT assertion to the existing text+dry-run test at line 152.

### Changes Required

**File**: `tests/cli/multi-loop.test.ts`

**Change A — Test `'run' lists pending rows in dry-run mode'` (line 38)**

Current (lines 48–54):
```typescript
const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
const events = log.trim().split("\n").map(l => JSON.parse(l));
const ingested = events.filter(e => e.event === "issue.ingested");
assert.equal(ingested.length, 2);

const stop = events.findLast((e: { event: string }) => e.event === "engine.stop");
assert.equal(stop.dry_run, true);
```

Replace with:
```typescript
const events = r.stdout.trim().split("\n").map((l: string) => JSON.parse(l));
const ingested = events.filter((e: { event: string }) => e.event === "issue.ingested");
assert.equal(ingested.length, 2);

const stop = events.findLast((e: { event: string }) => e.event === "engine.stop");
assert.equal(stop.dry_run, true);

try {
  await readFile(join(root, ".cycle/log.jsonl"), "utf8");
  assert.fail("run --dry-run should not write log.jsonl");
} catch (e: unknown) {
  assert.equal((e as NodeJS.ErrnoException).code, "ENOENT");
}
```

**Change B — Test `'run "<text>" --dry-run' pins raw frontmatter byte-shape'` (line 152)**

After the existing final assertion `assert.match(body, /\npark this too\n$/);` (line 196), add:
```typescript
try {
  await readFile(join(root, ".cycle/log.jsonl"), "utf8");
  assert.fail("run '<text>' --dry-run should not write log.jsonl");
} catch (e: unknown) {
  assert.equal((e as NodeJS.ErrnoException).code, "ENOENT");
}
```

### Success Criteria
- [ ] `npm test` passes all 4 tests in `multi-loop.test.ts`
- [ ] Test output shows `ingested.length === 2` sourced from stdout, not file
- [ ] ENOENT assertions fire without `assert.fail` in both dry-run tests
- [ ] `npm run check:coverage` passes — no floor regression

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] cycle run "<text>" --dry-run` in a fresh temp dir does not create `.cycle/log.jsonl` | Task 1 + Task 2 | Task 1 removes file creation; Task 2 (Change B) asserts ENOENT |
| `[ ] cycle run --dry-run` (no text) in a seeded queue still prints correct `issue.ingested` and `engine.stop` events on stdout | Task 1 | New block uses `console.log(JSON.stringify(...))` with matching shape |
| `[ ] Existing test `'run' lists pending rows in dry-run mode` parses stdout (not `log.jsonl`) and asserts `log.jsonl` is absent | Task 2 (Change A) | Switches from `readFile(log.jsonl)` to `r.stdout` parsing; adds ENOENT try/catch |
| `[ ] New e2e test asserts `cycle run "<text>" --dry-run` produces no `log.jsonl` (mirrors the equivalent drop assertion at `multi-loop.test.ts:141–145`) | Task 2 (Change B) | ENOENT assertion added to existing text+dry-run test at line 152 |
| `[ ] All existing tests still pass (`npm test`) | Task 1 + Task 2 | Both changes required for full suite green |
| `[ ] npm run typecheck` passes with no warnings | Task 1 | No new syntax; `console` is global; no import changes |
| `[ ] Coverage floors hold (`npm run check:coverage`) | Task 2 | New assertions increase branch coverage of dry-run path |

---

## Testing Strategy

### Unit Tests
Not applicable — `src/cli.ts` is a top-level script with no exportable functions. All testing is via integration.

### Integration / E2E Tests
- **Test 1** (`'run' lists pending rows in dry-run mode`): Seed two rows, run `cycle run --dry-run`, assert two `issue.ingested` events on stdout, `engine.stop.dry_run === true` on stdout, ENOENT on `log.jsonl`.
- **Test 2** (`'run "<text>" --dry-run' pins raw frontmatter`): Run `cycle run "park this too" --dry-run`, assert raw file written, frontmatter correct, ENOENT on `log.jsonl`.
- **No mocking** — tests invoke `dist/cycle.js` via `spawnSync` against real temp dirs. Real filesystem, real process exit.

## Risk Assessment
- **`todoDir` inlining**: Using `join(cwd, "docs/cycle/issues/todo", ...)` inline in the new dry-run block instead of `todoDir` variable — zero risk, same result, avoids forward-reference issue.
- **stdout interleaving**: After the move, no `emitStaleDistWarning` or `engine.start` fires in dry-run — stdout is guaranteed clean JSON-only. Verified by tracing the code path.
- **`findLast` on stdout-parsed events**: Already used in the test at line 53 with `events` from file; same call works on the stdout-parsed array.
- **`ts:` field in new block**: Adding `ts: new Date().toISOString()` matches `log.emit`'s contract. Existing test assertions don't check `ts` directly so no assertion breakage.
```
