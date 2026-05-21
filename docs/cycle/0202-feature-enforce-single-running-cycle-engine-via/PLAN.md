All open questions resolved. Writing the plan now.

`★ Insight ─────────────────────────────────────`
The open questions from RESEARCH are resolved: (1) `acquireLock` goes after the `dryRun` early-exit block but before `createLogger` — no lock needed for read-only dry runs, and we gain a logger for post-acquire work; (2) lock is unconditional on `cfg` presence — guards the drain loop regardless; (3) sync fs stays inside `engine-lock.ts` so `cli.ts` imports zero new modules; (4) integration test writes the lockfile directly with `process.pid` to simulate live-lock, avoiding the need to race two real supervisors.
`─────────────────────────────────────────────────`

# Implementation Plan: Cycle 0202

## Overview
Add a PID-based mutual-exclusion lockfile at `.cycle/engine.lock` so a second `cycle run` invocation while one is active exits non-zero immediately, without touching the queue or work tree.

## Current State (from Research)
- `src/cli.ts` is the monolithic supervisor entry point (top-level `await` script, not a class).
- The drain loop (`while (!halted)` at line 423) has no `try/finally` and no SIGINT/SIGTERM handlers.
- `createLogger` is called at line 116, before triage at line 136.
- The dryRun early-exit block ends at line 114 — a natural injection point for lock acquisition.
- `src/cli.ts` currently imports only `node:fs/promises`; sync fs must live entirely in the new module.
- `scripts/coverage-gate.mjs` FLOORS table (lines 12-24) — add one entry for the new file.
- `src/engine/path-utils.ts` already denies `.lock` suffix; `.cycle/engine.lock` is already covered.

## Desired End State
- `src/engine/engine-lock.ts` exists: exports `acquireLock(lockPath)` (throws if live lock) and `releaseLock(lockPath)` (idempotent).
- `src/cli.ts` acquires the lock before `createLogger`, registers SIGINT/SIGTERM handlers, wraps lines 116-551 in `try/finally { releaseLock(lockPath) }`.
- `tests/engine/engine-lock.test.ts` achieves 100% line coverage of the new module.
- `tests/cli/engine-lock-integration.test.ts` asserts that a supervisor launched with a live lockfile exits non-zero with the expected message.
- `scripts/coverage-gate.mjs` registers `"src/engine/engine-lock.ts": 100`.
- `npm test` passes; aggregate coverage does not decrease.

## What We're NOT Doing
- Daemon PID file (`.cycle/cycle.pid`) — separate concern, already in denylist.
- Queue atomicity beyond the lock — `popNextPending` + `markInProgress` race is not addressed here.
- Any changes to `src/engine/path-utils.ts` — `.lock` suffix already denied.
- Lock for `cycle triage`, `cycle status`, `cycle cleanup` — only the drain-loop supervisor needs it.
- Cross-machine or NFS-safe locking — single-machine assumption is sufficient.

## Implementation Approach
Two vertical slices: (1) build and test the `engine-lock.ts` module in isolation; (2) wire it into the supervisor and add an integration test. This ordering lets the unit tests validate the module's contract before the wiring is exercised end-to-end. Using sync fs inside the module keeps signal handlers safe (no `await` in SIGINT/SIGTERM) and avoids importing `node:fs` in `cli.ts`.

---

## Task 1: Create `src/engine/engine-lock.ts` + unit tests + coverage floor

### Overview
New module with `acquireLock` and `releaseLock`. Fully unit-tested (100% line coverage). Coverage floor registered.

### Changes Required

**File**: `src/engine/engine-lock.ts` *(new)*

```typescript
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

export function acquireLock(lockPath: string): void {
  try {
    const raw = readFileSync(lockPath, "utf8").trim();
    const pid = parseInt(raw, 10);
    if (!Number.isNaN(pid)) {
      try {
        process.kill(pid, 0);
        // EPERM lands here too — process is alive
        throw new Error(`engine already running, pid ${pid}`);
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === "ESRCH") {
          // stale lock — fall through and overwrite
        } else {
          throw e; // re-throw our own Error or EPERM
        }
      }
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") throw e;
    // ENOENT: no lock file, fall through
  }
  writeFileSync(lockPath, String(process.pid), "utf8");
}

export function releaseLock(lockPath: string): void {
  try {
    const raw = readFileSync(lockPath, "utf8").trim();
    if (raw === String(process.pid)) {
      unlinkSync(lockPath);
    }
  } catch {
    // ENOENT or other — idempotent, ignore
  }
}
```

Key design notes:
- `acquireLock` — outer try/catch handles ENOENT (no file). Inner `process.kill(pid, 0)` success or EPERM both mean live process → throw our user-visible error. ESRCH = stale → fall through to overwrite.
- `releaseLock` — checks PID ownership before deleting so a racing new supervisor doesn't delete a lock it doesn't own.

**File**: `scripts/coverage-gate.mjs` line 24 — add entry to FLOORS table:

```javascript
  "src/engine/path-utils.ts": 100,
  "src/engine/engine-lock.ts": 100,   // ADD THIS LINE
```

**File**: `tests/engine/engine-lock.test.ts` *(new)*

Four test cases:
1. **No lock file → acquires lock**: mock `readFileSync` to throw ENOENT, assert `writeFileSync` called with `process.pid`.
2. **Live lock (kill succeeds) → throws**: mock `readFileSync` to return `"12345"`, mock `process.kill` to succeed (no-op), assert throws `"engine already running, pid 12345"`.
3. **EPERM (alive, no permission) → throws**: mock `process.kill` to throw `{ code: "EPERM" }`, assert same error message as case 2.
4. **Stale lock (ESRCH) → reclaims**: mock `process.kill` to throw `{ code: "ESRCH" }`, assert `writeFileSync` called with our PID (overwrites).
5. **`releaseLock` when file has our PID → deletes**: assert `unlinkSync` called.
6. **`releaseLock` when file has other PID → no-op**: assert `unlinkSync` NOT called.
7. **`releaseLock` when file absent (ENOENT) → no-op**: assert no throw.

Use Node's built-in `mock` module (`import { mock } from "node:test"`) to stub `node:fs` functions. Restore mocks in `afterEach`.

```typescript
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
```

Pattern: `mock.module("node:fs", () => ({ readFileSync: ..., writeFileSync: ..., unlinkSync: ... }))` — then `import` engine-lock.ts after the mock is installed (dynamic import or module re-registration).

Alternative if module mocking is awkward: extract a `_testHooks` export with injectable fs functions, or use `--experimental-vm-modules`. Prefer real `node:test` mock.module if available on Node 22.22.2; fall back to a thin `_deps` injection object if mock.module has gaps.

### Success Criteria
- [ ] `src/engine/engine-lock.ts` compiles with `npm run typecheck` (no errors)
- [ ] `tests/engine/engine-lock.test.ts` exists with 7 test cases
- [ ] `npm run test:coverage` → coverage-gate passes for `src/engine/engine-lock.ts` at 100%
- [ ] All 7 cases pass

---

## Task 2: Wire lock into supervisor + integration test

### Overview
`src/cli.ts` acquires the lock before any engine work, registers SIGINT/SIGTERM handlers, and releases in finally. An integration test confirms a live-lock causes non-zero exit.

### Changes Required

**File**: `src/cli.ts`

**Import addition** (line 1 area):
```typescript
import { acquireLock, releaseLock } from "./engine/engine-lock.ts";
```

**Lock acquisition** — insert between the `dryRun` block (ends at line 114 `process.exit(0)`) and `createLogger` (line 116):

```typescript
const lockPath = join(cwd, ".cycle", "engine.lock");
try {
  acquireLock(lockPath);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
```

**SIGINT/SIGTERM handlers** — insert immediately after the lock acquisition block, before `createLogger`:

```typescript
process.on("SIGINT", () => { releaseLock(lockPath); process.exit(130); });
process.on("SIGTERM", () => { releaseLock(lockPath); process.exit(143); });
```

**try/finally around engine body** — wrap from `createLogger` (line 116) through `process.exit` (line 551):

```typescript
try {
  const log = await createLogger(cwd);
  // ... all existing code from line 116 to 550 ...
  process.exit(halted ? 1 : 0);
} finally {
  releaseLock(lockPath);
}
```

The `process.exit` inside `try` still triggers `finally` — this is correct Node.js behavior. `releaseLock` is idempotent, so calling it from both signal handler and finally is safe.

**File**: `tests/cli/engine-lock-integration.test.ts` *(new)*

Strategy: write the lockfile manually with `process.pid` (which is definitely alive), then `spawnSync` a supervisor and assert non-zero exit + stderr message. No need to race two real supervisors.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

// ensure dist is built before running
function ensureDist() { ... } // same pattern as halt.test.ts

test("live lock → supervisor exits 1 with live-pid message", async () => {
  await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-lock-test-"));
  try {
    await bootstrapRepo(root);   // copy .cycle/workflows.yml etc
    const lockPath = join(root, ".cycle", "engine.lock");
    await writeFile(lockPath, String(process.pid), "utf8"); // simulate live lock
    const dist = join(process.cwd(), "dist", "cycle.js");
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", dist, "run"],
      { cwd: root, encoding: "utf8", timeout: 10_000 }
    );
    assert.notEqual(result.status, 0);
    assert.ok(
      result.stderr.includes(`engine already running, pid ${process.pid}`),
      `expected live-pid message, got: ${result.stderr}`
    );
    // verify lock file was NOT deleted (supervisor didn't own it)
    const remaining = await readFile(lockPath, "utf8");
    assert.equal(remaining.trim(), String(process.pid));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stale lock → supervisor reclaims and runs normally", async () => {
  await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-lock-stale-"));
  try {
    await bootstrapRepo(root);
    const lockPath = join(root, ".cycle", "engine.lock");
    await writeFile(lockPath, "999999999", "utf8"); // dead PID
    const dist = join(process.cwd(), "dist", "cycle.js");
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", dist, "run"],
      { cwd: root, encoding: "utf8", timeout: 15_000 }
    );
    // supervisor should run (empty queue → exit 0)
    assert.equal(result.status, 0, `expected clean exit, stderr: ${result.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

`bootstrapRepo` — reuse or inline the helper from `tests/cli/halt.test.ts` (copies `.cycle/` directory structure with `workflows.yml`).

### Success Criteria
- [ ] `src/cli.ts` compiles with `npm run typecheck`
- [ ] Integration test: live-lock case exits non-zero with `engine already running, pid <N>`
- [ ] Integration test: stale-lock case exits 0 (engine runs normally with empty queue)
- [ ] Lock file is absent after a normal supervisor exit (released in finally)
- [ ] `npm test` passes end-to-end

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] A second \`cycle run\` started while one is active exits non-zero with "engine already running, pid N" and does NOT touch the queue.` | Task 2 | Integration test live-lock case; queue untouched because supervisor exits before `createLogger` |
| `[ ] A stale lock (PID no longer alive, ESRCH) is reclaimed automatically; the engine starts normally.` | Task 1 + Task 2 | Unit test case 4 covers ESRCH path; integration stale-lock test covers end-to-end |
| `[ ] The lock is released on normal exit, SIGINT, and SIGTERM.` | Task 2 | `finally` block covers normal exit; signal handlers cover SIGINT/SIGTERM |
| `[ ] Tests cover: live-lock rejection, stale-lock reclaim, release-on-exit, idempotent release.` | Task 1 + Task 2 | Unit tests 1-7 cover all four; integration tests cover live-lock and stale-lock end-to-end |
| `[ ] \`src/engine/engine-lock.ts\` registered in \`scripts/coverage-gate.mjs\` FLOORS table at 100% line coverage floor.` | Task 1 | Added as last entry in FLOORS table |
| `[ ] \`npm test\` passes; coverage does not decrease from master baseline.` | Task 1 + Task 2 | Verified as success criteria for both tasks |

---

## Testing Strategy

### Unit Tests
- File: `tests/engine/engine-lock.test.ts`
- Use `mock.module("node:fs", ...)` from `node:test` to stub `readFileSync`, `writeFileSync`, `unlinkSync`
- Test all three `process.kill(pid, 0)` branches: success (live), ESRCH (stale), EPERM (alive, no permission)
- Test `releaseLock` idempotency: ENOENT (no file), wrong PID (other owner), correct PID (deletes)
- No real filesystem access in unit tests
- If `mock.module` has import-ordering constraints in Node 22, inject via a thin `_deps` parameter passed only in tests (export `acquireLock(lockPath, deps?)` with default deps = real `node:fs` functions)

### Integration / E2E Tests
- File: `tests/cli/engine-lock-integration.test.ts`
- Use `bootstrapRepo` helper (copy from `halt.test.ts`) + `mkdtemp` pattern
- Live-lock: write `process.pid` to lockfile, `spawnSync` supervisor, assert exit ≠ 0 and stderr matches
- Stale-lock: write dead PID (`999999999`) to lockfile, `spawnSync` supervisor against empty queue, assert exit = 0

## Risk Assessment
- **`mock.module` ordering in Node 22**: Static imports resolve before `mock.module` in some Node versions. Mitigation: use dynamic `import()` after `mock.module`, or use the `_deps` injection pattern as fallback.
- **`process.exit` inside `try` skipping `finally`**: Node.js does call `finally` before process termination — this is safe. Verified behavior.
- **`999999999` PID colliding with a live process**: Unlikely, but possible on a system with very many processes. Alternative: iterate from `2^31 - 1` downward to find a dead PID at test time via `process.kill(pid, 0)`.
- **Lock file leftover from failed test**: `rm(root, { recursive: true, force: true })` in `finally` cleans the entire temp dir including the lockfile.
