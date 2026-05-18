Good — have enough context. Writing PLAN.md to stdout now.

# Implementation Plan: Cycle 0124

## Overview
Add a non-fatal `engine.warning {reason: "stale_dist"}` emitted just before `engine.start` when `dist/cycle.js` mtime is newer than the process-start instant, alerting operators that the running module graph is behind the built artifact.

## Current State (from Research)
- `src/cli.ts:92` is the exact anchor — `await log.emit("engine.start", ...)` — where the warning fires immediately before.
- `src/cli.ts:37` is the first executable line; no unconditional `await` fires before line 74 (`createLogger`), but a conditional `await getVersion()` exists at line 39 — `processStart` must precede both.
- Existing `engine.warning` pattern at lines 177, 191, 216 of `cli.ts`: `await log.emit("engine.warning", { reason: "...", message: "...", ...fields })`.
- `stat` from `node:fs/promises` is already used in `src/engine/run-cycle.ts`, `src/cli/init.ts`. Not yet imported in `cli.ts`.
- `join(cwd, "dist", "cycle.js")` is the correct path derivation — `cwd` is always the repo root; matches all other `join(cwd, ...)` patterns in `cli.ts`.
- No `src/engine/stale-dist.ts` exists; new module required.
- `scripts/coverage-gate.mjs` FLOORS table currently covers `triage.ts`, `issue-lifecycle.ts`, `commit-cycle.ts`, `branch.ts`. New module must be added.

## Desired End State
- `src/engine/stale-dist.ts` exports `emitStaleDistWarning(log, processStart, cwd, statFn?)`.
- `src/cli.ts` captures `processStart = Date.now()` before any `await`, imports and calls `emitStaleDistWarning` immediately before `engine.start`.
- `tests/engine/stale-dist.test.ts` covers all three branches (stale / fresh / missing-dist) via injected `statFn`.
- `scripts/coverage-gate.mjs` FLOORS includes `src/engine/stale-dist.ts: 95`.
- `docs/ENGINE.md` documents the stale-dist warning event.
- `npm test`, `npm run typecheck`, `npm run test:coverage && npm run check:coverage` all pass.

## What We're NOT Doing
- No process-per-cycle architecture (tracked separately as `refl-0059-spec-guard-bypassed-by-stale-engine-proc-process-per-cycle`).
- No automatic restart or enforcement on stale detection — surface only.
- No changes to triage, queue drain, reflection, or any other engine subsystem.
- No `import.meta.url` path derivation — `join(cwd, "dist", "cycle.js")` is sufficient.
- No changes to `CLAUDE.md`, `README.md`, or `AGENTS.md`.

## Implementation Approach
Extract the staleness check into `src/engine/stale-dist.ts` (not inline in `cli.ts`) so it can be unit-tested without importing the side-effect-laden CLI entry point. The helper accepts an injectable `statFn` defaulting to `stat` from `node:fs/promises`, enabling pure unit tests with no filesystem access. `cli.ts` wires `processStart` at the module's first executable line and calls the helper just before `engine.start`.

---

## Task 1: Create `src/engine/stale-dist.ts`

### Overview
New engine module exporting `emitStaleDistWarning`. Contains all staleness logic: stat the dist file, compare mtime, emit warning if stale, swallow ENOENT silently.

### Changes Required
**File**: `src/engine/stale-dist.ts` *(create)*

```typescript
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "./log.ts";

type StatFn = (path: string) => Promise<{ mtimeMs: number }>;

export async function emitStaleDistWarning(
  log: Logger,
  processStart: number,
  cwd: string,
  statFn: StatFn = stat,
): Promise<void> {
  const distPath = join(cwd, "dist", "cycle.js");
  let mtimeMs: number;
  try {
    const s = await statFn(distPath);
    mtimeMs = s.mtimeMs;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  if (mtimeMs <= processStart) return;
  await log.emit("engine.warning", {
    reason: "stale_dist",
    dist_mtime: mtimeMs,
    process_start: processStart,
    dist_path: distPath,
    message: `dist/cycle.js (${new Date(mtimeMs).toISOString()}) is newer than this process (${new Date(processStart).toISOString()}); restart the engine to pick up the latest build`,
  });
}
```

### Success Criteria
- [ ] `npm run typecheck` clean after creating this file.
- [ ] Stale branch: `statFn` returns `{ mtimeMs: processStart + 1 }` → `engine.warning` emitted with all five required fields.
- [ ] Fresh branch: `statFn` returns `{ mtimeMs: processStart }` → no emission.
- [ ] ENOENT branch: `statFn` rejects with `{ code: "ENOENT" }` → no emission, no throw.
- [ ] Non-ENOENT stat error → propagated (throws).

---

## Task 2: Write `tests/engine/stale-dist.test.ts`

### Overview
Three unit test branches covering every path in `emitStaleDistWarning`. No filesystem access — all via injected `statFn`. Captures log emissions via a simple fake logger.

### Changes Required
**File**: `tests/engine/stale-dist.test.ts` *(create)*

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emitStaleDistWarning } from "../../src/engine/stale-dist.ts";

function makeLog() {
  const events: { event: string; fields: Record<string, unknown> }[] = [];
  return {
    log: {
      emit: async (event: string, fields: Record<string, unknown>) => {
        events.push({ event, fields });
      },
    },
    events,
  };
}

const cwd = "/repo";
const processStart = 1_000_000;

describe("emitStaleDistWarning", () => {
  it("emits engine.warning when dist mtime > processStart", async () => {
    const { log, events } = makeLog();
    const distMtime = processStart + 1;
    await emitStaleDistWarning(log, processStart, cwd, async () => ({ mtimeMs: distMtime }));
    assert.equal(events.length, 1);
    const { event, fields } = events[0];
    assert.equal(event, "engine.warning");
    assert.equal(fields.reason, "stale_dist");
    assert.equal(fields.dist_mtime, distMtime);
    assert.equal(fields.process_start, processStart);
    assert.equal(fields.dist_path, `${cwd}/dist/cycle.js`);
    assert.ok(typeof fields.message === "string" && fields.message.length > 0);
  });

  it("emits no warning when dist mtime === processStart", async () => {
    const { log, events } = makeLog();
    await emitStaleDistWarning(log, processStart, cwd, async () => ({ mtimeMs: processStart }));
    assert.equal(events.length, 0);
  });

  it("emits no warning when dist mtime < processStart", async () => {
    const { log, events } = makeLog();
    await emitStaleDistWarning(log, processStart, cwd, async () => ({ mtimeMs: processStart - 1 }));
    assert.equal(events.length, 0);
  });

  it("emits no warning and does not throw when dist/cycle.js is absent (ENOENT)", async () => {
    const { log, events } = makeLog();
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    await assert.doesNotReject(() =>
      emitStaleDistWarning(log, processStart, cwd, async () => { throw enoent; })
    );
    assert.equal(events.length, 0);
  });

  it("propagates non-ENOENT stat errors", async () => {
    const { log } = makeLog();
    const err = Object.assign(new Error("EACCES"), { code: "EACCES" });
    await assert.rejects(
      () => emitStaleDistWarning(log, processStart, cwd, async () => { throw err; }),
      { code: "EACCES" },
    );
  });
});
```

### Success Criteria
- [ ] `npm test` passes with new test file included (auto-discovered).
- [ ] All five `it` blocks pass.
- [ ] `npm run test:coverage` shows `src/engine/stale-dist.ts` at ≥ 95% line, ≥ 75% branch.

---

## Task 3: Add coverage floor for `src/engine/stale-dist.ts`

### Overview
Extend the `FLOORS` table in `scripts/coverage-gate.mjs` so the new module is gated at 95% line coverage.

### Changes Required
**File**: `scripts/coverage-gate.mjs`

Add one entry to the `FLOORS` object:
```js
const FLOORS = {
  "src/engine/triage.ts": 95,
  "src/engine/issue-lifecycle.ts": 95,
  "src/engine/commit-cycle.ts": 95,
  "src/engine/branch.ts": 90,
  "src/engine/stale-dist.ts": 95,   // ← add this line
};
```

### Success Criteria
- [ ] `npm run check:coverage` passes after `npm run test:coverage`.
- [ ] `coverage-gate` prints `ok — src/engine/stale-dist.ts` line.

---

## Task 4: Wire `emitStaleDistWarning` into `cli.ts`

### Overview
Capture `processStart` at the first executable line of `cli.ts` (before any `await`) and call `emitStaleDistWarning` with `log` and `cwd` immediately before the `engine.start` emission at line 92.

### Changes Required
**File**: `src/cli.ts`

**Change 1** — add import at top of imports block:
```typescript
import { emitStaleDistWarning } from "./engine/stale-dist.ts";
```

**Change 2** — capture `processStart` as the very first executable line (immediately after the imports block, before line 37 `const argv = ...`):
```typescript
const processStart = Date.now();
```

**Change 3** — call the helper immediately before the `engine.start` emission (current line 92):
```typescript
await emitStaleDistWarning(log, processStart, cwd);
await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry });
```

The resulting sequence in `cli.ts` around lines 88–93:
```typescript
// ... (skipCompletedOnRetry assigned above)
await emitStaleDistWarning(log, processStart, cwd);
await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry });
```

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `npm test` passes (all existing tests unaffected).
- [ ] `processStart = Date.now()` is the first executable statement after the import block — visually confirmed in the file.
- [ ] `emitStaleDistWarning` call appears on the line immediately before `log.emit("engine.start", ...)`.

---

## Task 5: Update `docs/ENGINE.md`

### Overview
Add a short section documenting the stale-dist warning event so operators know what it means and what to do.

### Changes Required
**File**: `docs/ENGINE.md`

Add a new subsection after the existing engine-start content. The section below should be inserted after the first paragraph of the engine-start section (or as a standalone section if none exists yet). Insert after the "## Halt policy" section header area — find the natural anchor near `engine.start` description:

```markdown
## Stale-dist warning

When the engine process starts, it compares the mtime of `dist/cycle.js` against the instant the process launched (`Date.now()` captured before any `await`). If `dist/cycle.js` is newer, the engine emits one `engine.warning` before `engine.start`:

```json
{
  "event": "engine.warning",
  "reason": "stale_dist",
  "dist_mtime": 1234567890123,
  "process_start": 1234567890000,
  "dist_path": "/path/to/repo/dist/cycle.js",
  "message": "dist/cycle.js (...) is newer than this process (...); restart the engine to pick up the latest build"
}
```

**What it means:** The engine was rebuilt (`npm run build`) after this process started. The running module graph is behind the artifact on disk.

**Operator action:** Stop the engine and restart it — `dist/cycle.js` will be loaded fresh.

**No warning** is emitted when `dist/cycle.js` does not exist (ENOENT) or when its mtime ≤ process start. The engine continues regardless.
```

### Success Criteria
- [ ] Section appears in `docs/ENGINE.md` with all five payload fields documented.
- [ ] Operator action (restart) explicitly stated.
- [ ] ENOENT / fresh-dist suppression rule documented.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] engine.warning with reason: "stale_dist", dist_mtime, process_start, dist_path, message emitted exactly once when dist/cycle.js mtime > process start.` | Task 1, Task 2, Task 4 | Helper implements; tests verify; cli.ts wires |
| `[ ] No engine.warning emitted when dist/cycle.js mtime <= process start.` | Task 1, Task 2 | Fresh branch in stale-dist.ts; two test cases (equal and less) |
| `[ ] No engine.warning emitted when dist/cycle.js does not exist (stat ENOENT).` | Task 1, Task 2 | ENOENT branch in stale-dist.ts; test case asserts no emission |
| `[ ] processStart captured before the first await in cli.ts.` | Task 4 | `const processStart = Date.now()` first executable line after imports |
| `[ ] All existing tests still pass (npm test green).` | Task 4 | Verified after wiring; no behaviour change to existing paths |
| `[ ] Coverage gates green: line >= 95%, branch >= 75%, func >= 90%; per-file floors for triage.ts, issue-lifecycle.ts, commit-cycle.ts unaffected.` | Task 2, Task 3 | New tests achieve floor; existing floors untouched |
| `[ ] No compiler warnings (npm run typecheck clean).` | Task 1, Task 4 | Verified after each change |

---

## Testing Strategy

### Unit Tests
- `tests/engine/stale-dist.test.ts` — five `it` blocks:
  1. Stale (mtime = processStart + 1): assert `engine.warning` emitted with all five payload fields.
  2. Fresh-equal (mtime = processStart): assert no emission.
  3. Fresh-behind (mtime = processStart - 1): assert no emission.
  4. ENOENT: assert no throw, no emission.
  5. Non-ENOENT error: assert propagated.
- Fake logger captures emissions in-memory — no real `fs.stat` call, no subprocess.
- Anti-mock bias: the only injection is `statFn`; the real `Logger` interface shape is used (not mocked at the type level).

### Integration / E2E Tests
- No new integration test required: the wiring in `cli.ts` is covered by existing integration tests that already exercise the full startup path (`tests/cli/halt.test.ts`, etc.). A real `dist/cycle.js` always exists after `pretest` runs `npm run build`, so the fresh branch executes on every integration test run without an additional assertion.

## Risk Assessment
- **`processStart = Date.now()` placement**: If accidentally placed after a top-level `await` added in future, the warning could fire spuriously. Mitigated by the test that verifies the constant precedes all awaits — and by the comment-free-by-convention rule (relying on position in file as documentation).
- **Non-ENOENT stat errors**: A misconfigured filesystem that returns e.g. EACCES on `dist/cycle.js` will propagate and crash the engine. This is correct behaviour (unexpected permission error should not be swallowed), and covered by the fifth test case.
- **Coverage gate exit code 2**: If `test:coverage` doesn't exercise `stale-dist.ts` at all, the gate exits 2 (no LCOV block), not 1. Mitigated by Task 2 tests running in the same suite.
