Now I have everything needed to write the plan. Resolving open questions inline:

**Open Q1 (floor value)**: Script has ~60 executable lines. Hard-to-hit lines: line 25 (Windows `sep` branch, never true on macOS), line 39 (`throw err` in `fileExists` for non-ENOENT), line 53 (non-array object parsed — edge of malformed). 4 new tests + 7 existing cover ~95%+ of lines. Use **90** (conservative, matches `branch.ts`) — won't false-positive, leaves room for platform branches.

**Open Q3 (`coverage-gate.test.ts` update)**: Must extend `ALL_SIX_PASSING` fixture + absolute-path loop — both break if FLOORS grows to 7 without matching fixture.

# Implementation Plan: Cycle 0138

## Overview
Drop `--test-coverage-exclude='scripts/**'` from `package.json` so `scripts/sync-defaults.mjs` enters LCOV, add it to the coverage-gate FLOORS at 90%, fix the coverage-gate test fixtures to account for the new floor entry, and add four targeted branch tests for the divergence guard.

## Current State (from Research)
- `package.json:27` `test:coverage` has three `--test-coverage-exclude` flags; third is `scripts/**` — removing it is a single flag edit.
- `scripts/coverage-gate.mjs:12–19` has six FLOORS entries. Gate exits 2 if a FLOORS key has no LCOV block; adding `scripts/sync-defaults.mjs` to FLOORS requires the exclusion drop to land first (or both land together).
- `tests/scripts/coverage-gate.test.ts:19–26` has `ALL_SIX_PASSING` fixture used by tests 1 (all-pass) and 5 (absolute-path normalization). Adding a 7th FLOORS entry breaks both tests unless the fixture gains the 7th key.
- `tests/defaults/sync-defaults-guard.test.ts` has 7 existing E2E tests but covers none of the four AC branches (no malformed state, no missing src/defaults/, no force-with-no-divergence, no prior-state-entry-preserved test).
- Four gap branches: `loadState` malformed-JSON catch (line 55–57), `discoverPairs` ENOENT return (line 73), `if (force && forced.length > 0)` false path (line 125), loop `continue` preserves prior state entry (lines 110–113 + 119 + 123).

## Desired End State
- `package.json` `test:coverage` has two `--test-coverage-exclude` flags (`dist/**`, `tests/**`).
- `npm run test:coverage` LCOV includes a block for `scripts/sync-defaults.mjs`.
- `scripts/coverage-gate.mjs` FLOORS has 7 entries; `scripts/sync-defaults.mjs: 90`.
- `tests/scripts/coverage-gate.test.ts` passes with the 7-entry fixture.
- `tests/scripts/sync-defaults.test.ts` exists with 4 tests, all passing.
- `npm test`, `npm run test:coverage`, `npm run check:coverage`, and `npm run typecheck` all pass clean.

## What We're NOT Doing
- Changing any logic in `scripts/sync-defaults.mjs`.
- Adding floors for `scripts/coverage-gate.mjs` or `scripts/build.mjs`.
- Touching `tests/defaults/sync-defaults-guard.test.ts`.
- Adding tests beyond the four AC-named branches.

## Implementation Approach
Four tasks map to four change sites. Tasks 1+2 are mechanically coupled (drop exclusion → LCOV block exists → FLOORS entry is safe); do them in the same commit slice. Task 3 fixes the test breakage that Task 2 introduces. Task 4 is the new test file. Task 5 is the doc update. All tasks are independently verifiable.

---

## Task 1: Drop `scripts/**` Coverage Exclusion from `package.json`

### Overview
Remove the third `--test-coverage-exclude` flag from the `test:coverage` npm script so Node's built-in coverage reporter instruments `scripts/sync-defaults.mjs` (and the other two scripts).

### Changes Required
**File**: `package.json`

Current line 27 (approximately):
```
"test:coverage": "node --experimental-strip-types --test --test-coverage --test-coverage-exclude='dist/**' --test-coverage-exclude='tests/**' --test-coverage-exclude='scripts/**'",
```
Remove `--test-coverage-exclude='scripts/**'` (the third flag only):
```
"test:coverage": "node --experimental-strip-types --test --test-coverage --test-coverage-exclude='dist/**' --test-coverage-exclude='tests/**'",
```

### Success Criteria
- [ ] `package.json` `test:coverage` value no longer contains `scripts/**`
- [ ] `npm run test:coverage` produces LCOV blocks for `scripts/sync-defaults.mjs`, `scripts/coverage-gate.mjs`, `scripts/build.mjs`

---

## Task 2: Add `scripts/sync-defaults.mjs` to Coverage-Gate FLOORS

### Overview
Extend the `FLOORS` table in `scripts/coverage-gate.mjs` with a 90% floor for `scripts/sync-defaults.mjs`. Floor rationale: ~60 executable lines, platform-specific branch on Windows (line 25, `sep !== "/"`) and a non-ENOENT `fileExists` error path (line 39) are unreachable on macOS CI; 90% matches the conservative floor used for `src/engine/branch.ts`.

### Changes Required
**File**: `scripts/coverage-gate.mjs`, lines 12–19

Add one entry to `FLOORS`:
```js
const FLOORS = {
  "src/engine/triage.ts": 95,
  "src/engine/issue-lifecycle.ts": 95,
  "src/engine/commit-cycle.ts": 95,
  "src/engine/branch.ts": 90,
  "src/engine/stale-dist.ts": 95,
  "src/cli/run-one.ts": 70,
  "scripts/sync-defaults.mjs": 90,
};
```

### Success Criteria
- [ ] `scripts/coverage-gate.mjs` FLOORS has 7 entries
- [ ] `npm run check:coverage` (after `test:coverage`) passes for the new entry

---

## Task 3: Update `coverage-gate.test.ts` Fixtures for 7-Entry FLOORS

### Overview
Adding a 7th FLOORS entry causes two existing tests to fail with exit 2 (missing LCOV block). Update `ALL_SIX_PASSING` to include `scripts/sync-defaults.mjs` and update the absolute-path test's inline loop. Rename constant to `ALL_SEVEN_PASSING` for clarity.

### Changes Required
**File**: `tests/scripts/coverage-gate.test.ts`

**Change 1** — rename and extend the fixture constant (lines 19–26):
```ts
const ALL_SEVEN_PASSING = makeLcov({
  "src/engine/triage.ts": { lf: 100, lh: 100 },
  "src/engine/issue-lifecycle.ts": { lf: 100, lh: 100 },
  "src/engine/commit-cycle.ts": { lf: 100, lh: 100 },
  "src/engine/branch.ts": { lf: 100, lh: 100 },
  "src/engine/stale-dist.ts": { lf: 100, lh: 100 },
  "src/cli/run-one.ts": { lf: 100, lh: 100 },
  "scripts/sync-defaults.mjs": { lf: 100, lh: 100 },
});
```

**Change 2** — update test 1 reference: `ALL_SIX_PASSING` → `ALL_SEVEN_PASSING`

**Change 3** — update test 1 stdout assertions: add:
```ts
assert.match(result.stdout, /coverage-gate: ok — scripts\/sync-defaults\.mjs/);
```

**Change 4** — update test 5 absolute-path loop (lines 112–121) to include the 7th path:
```ts
for (const rel of [
  "src/engine/triage.ts",
  "src/engine/issue-lifecycle.ts",
  "src/engine/commit-cycle.ts",
  "src/engine/branch.ts",
  "src/engine/stale-dist.ts",
  "src/cli/run-one.ts",
  "scripts/sync-defaults.mjs",
]) {
```

### Success Criteria
- [ ] `tests/scripts/coverage-gate.test.ts` passes with `ALL_SEVEN_PASSING` fixture
- [ ] Test 1 and Test 5 both exit 0
- [ ] No other tests in `coverage-gate.test.ts` are modified

---

## Task 4: Create `tests/scripts/sync-defaults.test.ts` with 4 AC Branch Tests

### Overview
New test file covering the four branches identified in the issue and AC. Uses the same `spawnSync` + temp-dir pattern as the existing suite. Four isolated tests, each creating a minimal fixture in a fresh `mkdtemp` dir.

### Changes Required
**File**: `tests/scripts/sync-defaults.test.ts` (new)

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts/sync-defaults.mjs");

async function seed(root: string, files: Record<string, string>) {
  for (const [rel, body] of Object.entries(files)) {
    const dst = join(root, rel);
    await mkdir(dirname(dst), { recursive: true });
    await writeFile(dst, body);
  }
}

function runScript(root: string, opts: { force?: boolean } = {}) {
  const args = [SCRIPT];
  if (opts.force) args.push("--force");
  const env = { ...process.env };
  delete env.CYCLE_SYNC_DEFAULTS_FORCE;
  return spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8" as const });
}

// AC: malformed .cycle/.sync-state.json → loadState returns {}, run proceeds, exit 0
test("sync-defaults: malformed .sync-state.json is ignored, run exits 0", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-malformed-"));
  try {
    await seed(root, {
      "src/defaults/workflows.yml": "a: 1\n",
      ".cycle/.sync-state.json": "not valid json {{{",
    });
    const result = runScript(root);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /warning: ignoring malformed/);
    assert.equal(
      await readFile(join(root, ".cycle/workflows.yml"), "utf8"),
      "a: 1\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// AC: src/defaults/ missing → discoverPairs returns [], exit 0, no files written
test("sync-defaults: missing src/defaults/ exits 0 and writes no files", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-nosrc-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const result = runScript(root);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "");
    // state file written unconditionally (post-0136 behavior), but empty object
    const state = JSON.parse(await readFile(join(root, ".cycle/.sync-state.json"), "utf8"));
    assert.deepEqual(state, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// AC: --force with no divergent destinations → no force stderr line, exit 0
test("sync-defaults: --force with no divergent files produces no force stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-force-nodiv-"));
  try {
    await seed(root, {
      "src/defaults/workflows.yml": "a: 1\n",
    });
    const result = runScript(root, { force: true });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /force: overwriting/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// AC: skipped (divergent) path's prior state entry is unchanged after run
test("sync-defaults: prior state entry for skipped path is preserved", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-preserve-"));
  try {
    // Seed a prior state entry for the path that will be divergent
    const priorEntry = { src_sha256: "a".repeat(64), dst_sha256: "b".repeat(64) };
    await seed(root, {
      "src/defaults/workflows.yml": "source\n",
      "src/defaults/prompts/spec.md": "spec\n",
      ".cycle/workflows.yml": "diverged locally\n",
      ".cycle/.sync-state.json": JSON.stringify({
        ".cycle/workflows.yml": priorEntry,
      }),
    });
    const result = runScript(root);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    const state = JSON.parse(await readFile(join(root, ".cycle/.sync-state.json"), "utf8"));
    // Divergent path's prior entry must survive unchanged
    assert.deepEqual(state[".cycle/workflows.yml"], priorEntry);
    // Non-divergent path written normally
    assert.ok(state[".cycle/prompts/spec.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] File exists at `tests/scripts/sync-defaults.test.ts`
- [ ] All 4 tests pass
- [ ] `npm run typecheck` reports no errors on the new file
- [ ] Each test name maps directly to one of the four AC bullets

---

## Task 5: Update `CLAUDE.md` Coverage Policy

### Overview
The "Coverage policy" section documents which files are gated. After this cycle, `scripts/sync-defaults.mjs` is instrumented and has a per-file floor; the section should reflect that.

### Changes Required
**File**: `CLAUDE.md`, "Coverage policy" section

Add `scripts/sync-defaults.mjs` to the per-file floors note:
```
- **Per-file floors** (line ≥ 95% each): `src/engine/triage.ts`, `src/engine/issue-lifecycle.ts`, `src/engine/commit-cycle.ts`. `src/engine/branch.ts` (90%), `src/engine/stale-dist.ts` (95%), `src/cli/run-one.ts` (70%), `scripts/sync-defaults.mjs` (90%). Enforced by `scripts/coverage-gate.mjs` ...
```

Also note that `scripts/**` is no longer excluded from `test:coverage`.

### Success Criteria
- [ ] CLAUDE.md per-file floors list includes `scripts/sync-defaults.mjs (90%)`
- [ ] No mention of `scripts/**` exclusion unless as historical note

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] package.json test:coverage no longer contains --test-coverage-exclude='scripts/**'.` | Task 1 | Single flag removal |
| `[ ] npm run test:coverage produces an LCOV block for scripts/sync-defaults.mjs.` | Task 1 | Direct result of dropping the exclusion |
| `[ ] Test: malformed .cycle/.sync-state.json → loadState returns {}, run proceeds without error, exit 0.` | Task 4 | First test in new file |
| `[ ] Test: src/defaults/ directory missing → discoverPairs returns empty list, exit 0, no files written.` | Task 4 | Second test in new file |
| `[ ] Test: --force with no divergent destinations → no forced-overwrite stderr line, exit 0.` | Task 4 | Third test in new file |
| `[ ] Test: skipped (divergent) destination's prior .sync-state.json entry is unchanged after the run.` | Task 4 | Fourth test; verifies post-0136 loop `continue` behavior |
| `[ ] scripts/sync-defaults.mjs added to FLOORS in scripts/coverage-gate.mjs; gate passes.` | Task 2 + Task 3 | Task 2 adds entry; Task 3 fixes fixture so gate tests don't exit 2 |
| `[ ] All existing tests still pass (npm test).` | Task 3 | Fixes `coverage-gate.test.ts` breakage introduced by Task 2 |
| `[ ] npm run typecheck passes with no new warnings.` | Tasks 1–4 | `.test.ts` file uses only imported types; no new TypeScript required |

---

## Testing Strategy

### Unit Tests
- 4 new spawn-based tests in `tests/scripts/sync-defaults.test.ts` — each maps 1:1 to an AC branch
- No mocking; real file I/O in temp dirs
- Tests 1 and 5 in `tests/scripts/coverage-gate.test.ts` updated to pass 7-entry fixtures

### Integration / E2E Tests
- `npm run test:coverage` serves as the full integration gate: drops exclusion → LCOV has block → gate checks floor → passes
- `npm run check:coverage` runs automatically post-`test:coverage` via `posttest:coverage` in `package.json`

## Risk Assessment
- **Aggregate threshold drop from adding unexercised script branches**: `scripts/coverage-gate.mjs` and `scripts/build.mjs` also enter LCOV when `scripts/**` exclusion drops. Neither has a floor, but they could lower aggregate branch coverage. Mitigation: both scripts are already exercised via `npm test` (coverage-gate via its own test suite; build.mjs via `pretest`). Aggregate impact expected negligible; verify after Task 1 lands.
- **`ALL_SIX_PASSING` rename breaks nothing else**: only used in tests 1 and 5 of `coverage-gate.test.ts` — both are updated in Task 3. No other references.
- **Fourth test (prior-state preservation) depends on post-0136 behavior**: `writeStateAtomic` is called unconditionally after the loop (line 123), so a skipped path's entry from the pre-seeded state survives because the loop `continue`s before `state[to] = …` at line 119. If 0136 were reverted, this test would catch the regression. This is the intended pin behavior.
