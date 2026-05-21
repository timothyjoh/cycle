# Implementation Plan: Cycle 0232

## Overview

Add a test to `tests/engine/dot-env.test.ts` that exercises the non-ENOENT branch in `src/engine/dot-env.ts`, closing the last open branch gap and satisfying the 100% coverage floor. Optionally wrap the re-thrown error with an actionable message prefix while preserving the original `.code` property.

## Current State (from Research)

- `src/engine/dot-env.ts:9` — `if (err.code !== "ENOENT") throw e;` — the throw side of this branch has zero hits (`BRDA:9,3,0,0`). Branch coverage is 92.31% (12/13).
- `tests/engine/dot-env.test.ts` — 7 tests; no chmod, no mocking; uses `try/finally` for env-var cleanup; `writeFileSync` is the only sync fs import.
- `scripts/coverage-gate.mjs` — enforces `"src/engine/dot-env.ts": 100` per-file floor.
- `docs/ENGINE.md:226` — Known Limitations note describes the raw stack trace behavior.
- Established patterns: `Object.assign(new Error("EACCES"), { code: "EACCES" })`, `assert.throws`, `chmodSync`/`rmSync` for real-file permission tests, `mock.method(ns, "readFileSync", fn)` confirmed as root-guard fallback.

## Desired End State

- `tests/engine/dot-env.test.ts` has a new test that exercises the `throw e` path, covering `BRDA:9,3,0,0`.
- `src/engine/dot-env.ts` wraps the re-thrown error with a prefix message while keeping `.code` intact.
- `docs/ENGINE.md:226` note is updated to reflect the wrapped error behavior.
- `npm test`, `npm run test:coverage`, and `npm run check:coverage` all pass with no regression.

## What We're NOT Doing

- No changes to ENOENT handling or the happy-path parse logic.
- No new test files — all additions go in the existing `dot-env.test.ts`.
- No coverage changes to any other module.
- No changes to how `loadDotEnv` is called at bootstrap in `cli.ts`.
- No changes to `scripts/coverage-gate.mjs` or `CLAUDE.md` (floor already present).

## Implementation Approach

Two tasks as vertical slices:

**Task 1** closes the branch gap by adding a test. The chmod approach (real file, real permission denial) is primary because it's the most realistic signal. The root guard (`process.getuid?.() === 0`) replaces chmod with `mock.method` on the `node:fs` namespace to inject the error — the root path is a fallback only. After Task 1, `npm test` and coverage gate pass.

**Task 2** adds the friendly-message wrapper in `dot-env.ts`, enriches the test assertion to verify the wrapper, and replaces the Known Limitations paragraph in `docs/ENGINE.md`.

---

## Task 1: Add non-ENOENT test to `tests/engine/dot-env.test.ts`

### Overview

Add one test that causes `loadDotEnv` to throw by creating a temp file and calling `chmodSync(filePath, 0o000)`. The `finally` block restores permissions before unlinking. If the process is root, `mock.method` injects the error instead. The test asserts `assert.throws` with `{ code: "EACCES" }`.

### Changes Required

**File**: `tests/engine/dot-env.test.ts`

**Line 1** — extend `node:test` import to include `mock`:
```typescript
import { test, mock } from "node:test";
```

**Line 4** — extend sync `node:fs` import to include `chmodSync` and `rmSync`:
```typescript
import { writeFileSync, chmodSync, rmSync } from "node:fs";
```

Add a namespace import for mock-method targeting (root guard path), after line 4:
```typescript
import * as nodefs from "node:fs";
```

**After line 115** — append the new test:
```typescript
test("non-ENOENT error (EACCES) is re-thrown", () => {
  const fakeErr = Object.assign(new Error("EACCES"), { code: "EACCES" });

  if (process.getuid?.() === 0) {
    // chmod 0o000 is ineffective as root — mock readFileSync to inject the error
    const m = mock.method(nodefs, "readFileSync", () => { throw fakeErr; });
    try {
      assert.throws(() => loadDotEnv("any.env"), { code: "EACCES" });
    } finally {
      m.mock.restore();
    }
    return;
  }

  const filePath = join(tmpdir(), `cycle-dot-env-eacces-${Date.now()}.env`);
  writeFileSync(filePath, "KEY=value\n", "utf8");
  chmodSync(filePath, 0o000);
  try {
    assert.throws(() => loadDotEnv(filePath), { code: "EACCES" });
  } finally {
    chmodSync(filePath, 0o644);
    rmSync(filePath);
  }
});
```

### Success Criteria

- [ ] `npm test` passes (all 8 tests green)
- [ ] `npm run test:coverage` passes
- [ ] `npm run check:coverage` passes — `src/engine/dot-env.ts` branch coverage reaches 100% (13/13)
- [ ] All 7 existing tests still pass

---

## Task 2: Add friendly-message wrapper in `src/engine/dot-env.ts` and update docs

### Overview

Replace the bare `throw e` with a wrapped error that includes a human-readable prefix message and preserves the original `.code`. Update the test assertion to verify the wrapper. Update `docs/ENGINE.md:226` to retire the Known Limitation note.

### Changes Required

**File**: `src/engine/dot-env.ts`

Replace lines 7–11:
```typescript
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") throw e;
    return;
  }
```

With:
```typescript
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw Object.assign(
        new Error(`Cannot read .env file at ${filePath}: ${err.message}`),
        { code: err.code }
      );
    }
    return;
  }
```

**File**: `tests/engine/dot-env.test.ts`

Extend the `assert.throws` calls in the new test (from Task 1) to also verify the wrapper:

```typescript
    assert.throws(
      () => loadDotEnv("any.env"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as NodeJS.ErrnoException).code, "EACCES");
        assert.ok((err as Error).message.includes("Cannot read .env file"));
        return true;
      }
    );
```

Apply the same extended assertion to the chmod path:

```typescript
    assert.throws(
      () => loadDotEnv(filePath),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as NodeJS.ErrnoException).code, "EACCES");
        assert.ok((err as Error).message.includes("Cannot read .env file"));
        return true;
      }
    );
```

**File**: `docs/ENGINE.md`

Replace line 226:
```
**Known limitation:** `loadDotEnv` swallows only `ENOENT` (missing file). Any other `readFileSync` error — `EACCES`, `EISDIR`, etc. — propagates as an unhandled exception and crashes the engine at bootstrap before any user-facing error handling runs. The test suite does not exercise this path, so the raw Node.js stack trace is the only diagnostic. Operator fix: ensure `.cycle/.env` is a readable file or absent entirely.
```

With:
```
**Non-ENOENT errors from `.cycle/.env`**: `loadDotEnv` silently ignores `ENOENT` (missing file). Any other `readFileSync` error — `EACCES`, `EISDIR`, etc. — is re-thrown as a new `Error` with an actionable prefix message (`Cannot read .env file at <path>: <original message>`) and the original `.code` property intact. This propagates as an unhandled exception before `loadConfig` runs; the prefix message identifies the file and cause. Operator fix: ensure `.cycle/.env` is a readable file or absent entirely.
```

### Success Criteria

- [ ] `src/engine/dot-env.ts` compiles cleanly — `npm run typecheck` passes
- [ ] `npm test` passes — all 8 tests green
- [ ] `npm run test:coverage` passes with no coverage decrease
- [ ] `npm run check:coverage` passes — per-file floor satisfied
- [ ] Test assertions verify `instanceof Error`, `.code === "EACCES"`, and `.message` includes prefix
- [ ] `docs/ENGINE.md` no longer contains the "test suite does not exercise this path" sentence

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] tests/engine/dot-env.test.ts contains a test that causes loadDotEnv to throw on a non-ENOENT error (e.g., EACCES)` | Task 1 | chmod primary + mock.method root guard |
| `[ ] Branch coverage for src/engine/dot-env.ts reaches 100% (both branches of the code !== 'ENOENT' guard covered)` | Task 1 | BRDA:9,3,0,0 covered by new test |
| `[ ] npm test passes` | Task 1 | Verified after both tasks |
| `[ ] npm run test:coverage passes with no decrease in overall line/branch/function coverage vs baseline` | Task 1 | No regressions expected |
| `[ ] npm run check:coverage passes — the src/engine/dot-env.ts (100%) per-file floor in CLAUDE.md is satisfied` | Task 1 | 100% line floor already passing; branch gap closes |
| `[ ] All existing tests still pass` | Task 1 | No existing test modified |
| `[ ] No compiler/linter warnings introduced` | Task 2 | `npm run typecheck` must be clean |

---

## Testing Strategy

### Unit Tests

- New test in `tests/engine/dot-env.test.ts`: "non-ENOENT error (EACCES) is re-thrown"
- Chmod path (uid ≠ 0): `writeFileSync` → `chmodSync(0o000)` → `assert.throws` → `finally: chmodSync(0o644); rmSync`
- Root guard path (uid === 0): `mock.method(nodefs, "readFileSync", () => { throw fakeErr; })` → `assert.throws` → `finally: m.mock.restore()`
- Assertions: `instanceof Error`, `.code === "EACCES"`, `.message.includes("Cannot read .env file")`
- No mocking of `loadDotEnv` itself — real function called with real (or mock-injected) I/O error
- The ENOENT no-op test is unchanged and continues to confirm the other branch

### Integration / E2E Tests

- Existing integration smoke test ("CYCLE_TRUNK_BASED propagates to loadConfig") remains unchanged and covers the happy path through `loadDotEnv` into `loadConfig`

## Risk Assessment

- **ESM named-import mock binding**: `mock.method(nodefs, "readFileSync", ...)` patches the CJS exports object; confirmed to work for `node:fs` on Node 22.22.2 (research obs 3263). The chmod path is primary and avoids this entirely.
- **Root CI containers**: The root guard ensures the test doesn't silently pass for wrong reasons on Docker-based CI running as root — mock.method path is exercised instead.
- **chmod restore on failure**: The `finally` block runs even when `loadDotEnv` throws, so permissions are always restored before `rmSync`. File is not left in 0o000 state.
- **Wrapper changes thrown type**: Callers catching the raw error from `loadDotEnv` get a new `Error` instance instead of the original — `.code` is preserved, so `err.code !== "ENOENT"` callers are unaffected. The only caller is the bootstrap in `cli.ts`, which does not catch `loadDotEnv` errors.
