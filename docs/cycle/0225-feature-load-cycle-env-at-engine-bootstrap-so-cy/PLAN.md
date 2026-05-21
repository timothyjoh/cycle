# Implementation Plan: Cycle 0225

## Overview

Create `src/engine/dot-env.ts` — a hand-rolled `.cycle/.env` loader — and wire it into `src/cli.ts` at engine bootstrap so that `CYCLE_TRUNK_BASED=1` in `.cycle/.env` is honored by `loadConfig()`, making the documented trunk-mode configuration mechanism actually work.

## Current State (from Research)

- `src/cli.ts:137` sets `CYCLE_TRUNK_BASED` when `--trunk` is passed; `src/cli.ts:139` calls `loadConfig(cwd)`. Line 138 is blank — the injection point.
- `src/engine/workflow.ts:86–88` reads `env.CYCLE_TRUNK_BASED === "1"` and sets `commitConfig.mode = "trunk"`. Nothing else consumes this variable.
- No code reads `.cycle/.env` anywhere — repos relying on it silently run `worktree-pr` mode.
- Canonical small-synchronous-utility pattern: `engine-lock.ts` (sync `readFileSync`, ENOENT guard, 100% coverage floor). `dot-env.ts` follows this pattern without injectable deps (SPEC calls for real tmpdir in tests instead).
- `scripts/coverage-gate.mjs:12–27` `FLOORS` table has entries for `path-utils`, `engine-lock`, `child-env`, `log-fmt` all at 100. New entry goes after `log-fmt`.
- Test patterns: `node:test` + `node:assert/strict`, real tmpdir via `mkdtemp(join(tmpdir(), "cycle-test-"))`, `process.env` save/restore in `finally`.

## Desired End State

- `src/engine/dot-env.ts` exports `loadDotEnv(filePath: string): void`.
- `src/cli.ts:138` calls `loadDotEnv(join(cwd, ".cycle", ".env"))`.
- `tests/engine/dot-env.test.ts` covers all six parse cases plus integration smoke; `src/engine/dot-env.ts` reports 100% line coverage from `npm run check:coverage`.
- `scripts/coverage-gate.mjs` FLOORS table includes `"src/engine/dot-env.ts": 100`.
- `docs/ENGINE.md` bootstrap section notes that `loadDotEnv(.cycle/.env)` runs before `loadConfig()`.
- `npm test` passes with no regressions; all existing coverage floors hold.

## What We're NOT Doing

- Not changing the shipped `worktree-pr` default in `src/defaults/workflows.yml`.
- Not supporting quoted values, multi-line values, or variable interpolation.
- Not reading `.env` files from any location other than `.cycle/.env`.
- Not adding injectable deps to `dot-env.ts` (real-fs tmpdir approach per SPEC).
- Not changing `buildChildEnv` — it already strips all `CYCLE_*` vars; no change needed.
- Not updating `CLAUDE.md` — the `.env` mechanism is already documented there.

## Implementation Approach

The implementation is a three-file change plus a docs update:
1. New module `src/engine/dot-env.ts` with synchronous parse logic mirroring `engine-lock.ts`'s ENOENT guard.
2. New test file `tests/engine/dot-env.test.ts` covering all SPEC cases plus an integration smoke via `loadConfig`.
3. Two-line change to `src/cli.ts`: one import addition, one call insertion.
4. One-line addition to `scripts/coverage-gate.mjs` FLOORS.
5. One-paragraph addition to `docs/ENGINE.md`.

Precedence ordering is guaranteed by insertion position: `--trunk` sets `CYCLE_TRUNK_BASED` at line 137 → `loadDotEnv` runs at new line 138 (real-env-wins skips already-set keys) → `loadConfig` reads `process.env` at line 139.

---

## Task 1: Create `src/engine/dot-env.ts`

### Overview

New module exporting `loadDotEnv(filePath)`. Reads the file synchronously, silently no-ops on ENOENT, parses `KEY=VALUE` lines, and sets `process.env[key]` only when `process.env[key] === undefined`.

### Changes Required

**File**: `src/engine/dot-env.ts` (new file)

```typescript
import { readFileSync } from "node:fs";

export function loadDotEnv(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") throw e;
    return;
  }
  for (const line of content.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
```

### Success Criteria

- [ ] `tsc --noEmit` reports no errors for the new file.
- [ ] Module is importable from `src/cli.ts` as `"./engine/dot-env.ts"`.

---

## Task 2: Write `tests/engine/dot-env.test.ts`

### Overview

Six unit test cases covering all SPEC-required parse rules plus one integration smoke that chains `loadDotEnv` → `loadConfig` and asserts `commit.mode === "trunk"`.

### Changes Required

**File**: `tests/engine/dot-env.test.ts` (new file)

Test structure (all using `node:test` + `node:assert/strict`, real tmpdir, `process.env` save/restore in `finally`):

1. **`ENOENT is a no-op`**: pass a path that does not exist; assert no error thrown.
2. **`normal KEY=VALUE is set`**: write `MY_KEY=hello` to a tmpfile; call `loadDotEnv`; assert `process.env.MY_KEY === "hello"`; restore in `finally`.
3. **`blank lines are skipped`**: file with empty lines interleaved; assert parse succeeds with no error.
4. **`#-comment lines are skipped`**: file with `# comment` lines; assert those keys are never set.
5. **`lines with no = are skipped`**: file with `NOEQUALSSIGN`; assert no error thrown, key not set.
6. **`real-env-wins`**: pre-set `process.env.PREEXISTING_KEY = "original"` before calling; file contains `PREEXISTING_KEY=override`; assert value remains `"original"` after call; restore in `finally`.
7. **`integration smoke — CYCLE_TRUNK_BASED propagates to loadConfig`**: write tmpfile with `CYCLE_TRUNK_BASED=1`; ensure `process.env.CYCLE_TRUNK_BASED` is `undefined` before call; call `loadDotEnv(tmpfile)`; call `loadConfig(root)` with a real tmpdir containing `.cycle/`; assert `cfg.engine.commit.mode === "trunk"`; restore `CYCLE_TRUNK_BASED` in `finally`.

All tests that mutate `process.env` follow the save/restore pattern from `tests/engine/workflow.test.ts:224–232`:
```typescript
const prev = process.env.KEY;
try {
  // ...test...
} finally {
  if (prev === undefined) delete process.env.KEY;
  else process.env.KEY = prev;
}
```

### Success Criteria

- [ ] `npm test` passes with all new tests green.
- [ ] `npm run check:coverage` reports `src/engine/dot-env.ts` at 100% line coverage (after Task 3 registers the floor).
- [ ] No cross-test `process.env` contamination (each mutating test restores in `finally`).

---

## Task 3: Register `src/engine/dot-env.ts` in `scripts/coverage-gate.mjs`

### Overview

Add `"src/engine/dot-env.ts": 100` to the `FLOORS` table so the coverage gate enforces 100% line coverage on the new module.

### Changes Required

**File**: `scripts/coverage-gate.mjs`

In the `FLOORS` object (lines 12–27), add after `"src/engine/log-fmt.ts": 100`:

```javascript
  "src/engine/log-fmt.ts": 100,
  "src/engine/dot-env.ts": 100,
```

### Success Criteria

- [ ] `npm run check:coverage` exits 0 with `src/engine/dot-env.ts` listed as passing its floor.
- [ ] If coverage drops below 100%, `check:coverage` exits 1 — confirming the gate is active.

---

## Task 4: Wire `loadDotEnv` into `src/cli.ts`

### Overview

Two changes to `src/cli.ts`: add import alongside the existing engine-lock import, and insert the call at line 138 (the blank line between `--trunk` check and `loadConfig`).

### Changes Required

**File**: `src/cli.ts`

**Import addition** — after line 27 (`import { acquireLock, releaseLock } from "./engine/engine-lock.ts";`):

```typescript
import { acquireLock, releaseLock } from "./engine/engine-lock.ts";
import { loadDotEnv } from "./engine/dot-env.ts";
```

**Call insertion** — replace blank line 138 (between lines 137 and 139):

```typescript
if (args.trunk) process.env.CYCLE_TRUNK_BASED = "1";
loadDotEnv(join(cwd, ".cycle", ".env"));
const cfg = await loadConfig(cwd);
```

`join` is already imported at `src/cli.ts:2`. No new imports needed beyond the `loadDotEnv` import above.

### Success Criteria

- [ ] `npm run typecheck` passes with no errors.
- [ ] `npm test` passes with no regressions.
- [ ] Manual verification: create `.cycle/.env` with `CYCLE_TRUNK_BASED=1` (unset in shell); run `node .cycle/bin/cycle.js run --dry-run`; `cycle.checkout` log event shows trunk-mode behavior, or `loadConfig` returns `commit.mode === "trunk"`.

---

## Task 5: Update `docs/ENGINE.md`

### Overview

Add a bootstrap-sequence note explaining that `loadDotEnv(.cycle/.env)` runs before `loadConfig()` with real-env-wins semantics.

### Changes Required

**File**: `docs/ENGINE.md`

In the commit mode section (near line 155, where `mode: trunk | local-only | worktree-pr` is documented), add the following note before or after the existing mode descriptions:

> **Bootstrap precedence**: At engine startup, `loadDotEnv(.cycle/.env)` runs after the `--trunk` flag check and before `loadConfig()`. It sets `process.env` keys only when not already defined (real-env-wins). This means: shell env overrides `.cycle/.env`; `--trunk` overrides `.cycle/.env` (because it sets `CYCLE_TRUNK_BASED` before `loadDotEnv` runs); and `.cycle/.env` overrides the shipped `worktree-pr` default.

### Success Criteria

- [ ] `docs/ENGINE.md` contains a note about `loadDotEnv(.cycle/.env)` in the bootstrap/commit-mode section.
- [ ] `npm test` (which does not lint docs) continues to pass.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] With .cycle/.env containing CYCLE_TRUNK_BASED=1 and CYCLE_TRUNK_BASED not exported in the shell, cycle run resolves commit.mode to trunk. Verifiable via a cycle.checkout log event with reason: "trunk" or equivalent trunk-mode behavior.` | Task 2 (integration smoke), Task 4 (wiring) | Integration smoke in Task 2 tests this directly via `loadConfig`; Task 4 wires it into the live bootstrap path |
| `[ ] A real exported env var (CYCLE_TRUNK_BASED=1 in the process environment) takes precedence over a conflicting value in .cycle/.env.` | Task 2 | Test 6 (real-env-wins) covers this case |
| `[ ] --trunk CLI flag takes precedence over .cycle/.env (flag sets process.env.CYCLE_TRUNK_BASED = "1" at cli.ts:137 before loadDotEnv runs at line 138).` | Task 4 | Structural guarantee: `--trunk` sets `CYCLE_TRUNK_BASED` at line 137; `loadDotEnv` runs at new line 138; real-env-wins rule in `dot-env.ts` skips the key |
| `[ ] Blank lines, #-prefixed comment lines, and lines with no = character are silently skipped — no error thrown, no log noise.` | Task 2 | Tests 3, 4, 5 cover blank lines, comment lines, and no-`=` lines respectively |
| `[ ] A missing .cycle/.env file is a no-op — no thrown error, no log output.` | Task 2 | Test 1 (ENOENT no-op) covers this |
| `[ ] Unit tests cover all five cases above. src/engine/dot-env.ts reaches 100% line coverage per npm run check:coverage.` | Task 2, Task 3 | Tests 1–6 cover all cases; Task 3 registers the 100% floor |
| `[ ] npm test passes with no regressions. All existing coverage floors hold.` | Task 2, Task 3, Task 4 | Verified after each task; final confirmation after Task 4 wiring |

---

## Testing Strategy

### Unit Tests

- **Location**: `tests/engine/dot-env.test.ts`
- **Framework**: `node:test` + `node:assert/strict` (no external framework)
- **Filesystem isolation**: `writeFileSync` to `tmpdir()`-based temp paths; cleanup not strictly required for single-file writes but done for cleanliness.
- **`process.env` isolation**: save/restore pattern in `finally` for every test that mutates env.
- **Cases**: ENOENT no-op, normal set, blank-line skip, comment-line skip, no-`=` skip, real-env-wins, integration smoke via `loadConfig`.
- **No mocking**: real filesystem (`writeFileSync` to tmpdir), real `process.env` mutations with restore.

### Integration / E2E Tests

- Integration smoke lives in `tests/engine/dot-env.test.ts` (test 7): write a `.env` file to tmpdir, call `loadDotEnv`, call `loadConfig(root)`, assert `commit.mode === "trunk"`. This mirrors the existing pattern in `tests/engine/workflow.test.ts:302–333`.
- No additional integration test file needed — the smoke in the unit test file covers the end-to-end propagation path.

## Risk Assessment

- **`process.env` cross-test contamination**: mitigated by save/restore in `finally` in every env-mutating test.
- **Key with empty string after `=`**: `line.slice(eq + 1).trim()` returns `""` — setting `process.env[key] = ""` is valid Node behavior (empty string ≠ undefined); no special handling needed.
- **Key that is blank (e.g., `=VALUE`)**: `key = "".trim() = ""`; setting `process.env[""] = value` is unusual but not an error. SPEC does not require rejecting empty keys; no guard needed.
- **`loadConfig` tmpdir setup for integration smoke**: `loadConfig` requires a `.cycle/` directory structure. Reuse the pattern from `tests/engine/workflow.test.ts` (create tmpdir with `mkdir .cycle && write workflows.yml`) to avoid test fragility.
