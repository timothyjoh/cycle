Have enough context. Writing the research document.

```markdown
# Research: Cycle 0135

## Cycle Context
Cycle 0135 adds `tests/scripts/coverage-gate.test.ts` with 5 fixture-driven child-process test cases
for `scripts/coverage-gate.mjs` — the per-file LCOV coverage gate. The gate has 6 floor entries and
exit-code semantics (0 pass, 1 below-floor, 2 config/file error), but has zero tests. The cycle must
cover all exit codes and the currently-dead absolute-path normalization branch (line 40).

## Current Codebase State

### Relevant Components

- **`scripts/coverage-gate.mjs`** — 73-line ESM script; the sole subject of this cycle.
  - `FLOORS` table (`lines 12–19`): 6 entries —
    `"src/engine/triage.ts": 95`, `"src/engine/issue-lifecycle.ts": 95`,
    `"src/engine/commit-cycle.ts": 95`, `"src/engine/branch.ts": 90`,
    `"src/engine/stale-dist.ts": 95`, `"src/cli/run-one.ts": 70`
  - LCOV path resolved at `line 21`: `process.argv[2] ?? ".cycle/coverage.lcov"`
  - File read + exit-2 on missing file: `lines 24–31`
  - LCOV parser loop (`lines 33–52`): walks lines looking for `SF:`, `LF:`, `LH:`, `end_of_record`;
    builds `Map<string, {lf, lh}>`
  - **Absolute-path normalization branch** (`line 40`): `if (isAbsolute(sf)) sf = relative(process.cwd(), sf)` — currently dead under Node 22 which emits relative `SF:` paths
  - Floor-check loop (`lines 54–70`): iterates `Object.entries(FLOORS)` in insertion order; exits `2`
    immediately on first missing block; increments `failed` counter for below-floor files; exits `1`
    if any failed, `0` otherwise

- **`tests/defaults/sync-defaults-guard.test.ts`** — canonical reference for child-process test style (`lines 1–193`)
  - Uses `spawnSync(process.execPath, [SCRIPT], { cwd: root, env, encoding: "utf8" })` — exact
    pattern the SPEC mandates
  - Per-test `mkdtemp` + `try/finally rm(root, { recursive: true, force: true })`
  - All inline assertions against `result.status`, `result.stdout`, `result.stderr`

- **`tests/defaults/scripts.test.ts`** — minimal script test file in `tests/defaults/`; no child-process
  invocation; shows `node:test` + `node:assert` with simple `readFile` assertions (`lines 1–19`)

- **`tests/scripts/`** — **does not exist yet**; must be created as part of this cycle

### Existing Patterns to Follow

- **Imports**: `import { test } from "node:test"` + `import { strict as assert } from "node:assert"` — every test file in repo
- **Child-process invocation**: `spawnSync(process.execPath, [SCRIPT_PATH], { cwd, env, encoding: "utf8" as const })` — `sync-defaults-guard.test.ts:24`
- **Script path constant**: `const SCRIPT = join(process.cwd(), "scripts/coverage-gate.mjs")` — analogous to `sync-defaults-guard.test.ts:8`
- **Tmp dir lifecycle**: `mkdtemp(join(tmpdir(), "cycle-<slug>-"))` → work → `rm(root, { recursive: true, force: true })` in `finally` — `sync-defaults-guard.test.ts:29,56`
- **Fixture setup**: `mkdir` + `writeFile` within tmpdir; no shared seed helper needed for this cycle
- **Assertions pattern**: `assert.equal(result.status, 0, \`stderr: ${result.stderr}\`)` for exit code; `assert.match(result.stderr, /pattern/)` for error messages

### LCOV Fixture Constraint (Critical for Planner)

The floor-check loop in `coverage-gate.mjs:54–70` exits `2` immediately on the **first** missing
`FLOORS` key, iterating in insertion order (`triage.ts` first). Consequence:

- **Passing path**, **Failing path**, and **Absolute SF: normalized** tests must include LCOV blocks
  for **all 6 floor files** to reach exit 0 or exit 1. A minimal fixture with only `triage.ts`
  will exit 2 before the floor check for all but the "configured path missing" test.
- **Configured path missing** test: omitting only `triage.ts` works because it is iterated first —
  the script hits `exit(2)` immediately without checking the others.
- **Absent LCOV file** test: no fixture file needed — the `readFile` catch fires first.

A valid passing LCOV block per file looks like:
```
SF:<path>
LF:100
LH:100
end_of_record
```
(`LH/LF = 100/100` → 100% ≥ any floor)

### Absolute-Path Normalization Branch

- Branch location: `coverage-gate.mjs:40`
- Logic: `sf = relative(process.cwd(), sf)` when `isAbsolute(sf)` is true
- `process.cwd()` inside the script equals the `cwd` passed to `spawnSync`
- To exercise the branch: set `cwd` in `spawnSync` to a synthetic absolute directory (e.g.
  `/tmp/fake-repo-root`) and emit `SF:/tmp/fake-repo-root/src/engine/triage.ts` (and all other 5
  floor files) in the LCOV fixture — after normalization these become bare relative paths matching
  the FLOORS keys
- The `cwd` dir does not need to actually contain any files beyond `.cycle/coverage.lcov`

### Dependencies & Integration Points

- **`package.json` test command** (`line 25`): `node --test --experimental-strip-types --test-reporter=spec` — no explicit file list; Node 22 auto-discovers `**/*.test.{ts,js,mts}` files. `tests/scripts/coverage-gate.test.ts` will be auto-discovered once the directory exists.
- **`package.json` test:coverage** (`line 27`): excludes `scripts/**` from coverage instrumentation — tests in `tests/scripts/` won't affect `coverage-gate.mjs` coverage numbers (per SPEC, this is intentional and out of scope for this cycle)
- **`posttest:coverage`** (`line 28`): runs `coverage-gate.mjs` — the script under test is also used as a gate; circular, but benign since the test file is in `tests/scripts/` not `scripts/`
- **`tsconfig.json`**: not read — `--experimental-strip-types` handles `.ts` test files directly; no separate `tsconfig` for tests

### Test Infrastructure

- **Framework**: `node:test` + `node:assert` (built-in, no third-party deps)
- **Discovery**: Node 22 `--test` auto-discovers `**/*.test.ts` recursively; no registration needed
- **Strip types**: `--experimental-strip-types` allows `.ts` files without a compile step
- **Encoding**: `spawnSync` must be called with `encoding: "utf8" as const` for `result.stdout`/`result.stderr` to be strings (otherwise they're `Buffer`)
- **Existing coverage of `coverage-gate.mjs`**: zero — the script is excluded from instrumentation by `--test-coverage-exclude='scripts/**'`

## Code References

- `scripts/coverage-gate.mjs:12–19` — FLOORS table (6 entries; insertion order matters for test design)
- `scripts/coverage-gate.mjs:21` — LCOV_PATH argv fallback
- `scripts/coverage-gate.mjs:24–31` — missing-file catch → exit 2
- `scripts/coverage-gate.mjs:38–51` — LCOV block parser (SF/LF/LH/end_of_record)
- `scripts/coverage-gate.mjs:40` — absolute-path normalization (`isAbsolute` + `relative(cwd, sf)`)
- `scripts/coverage-gate.mjs:54–70` — floor check loop; exit 2 on missing block (first-in-order wins)
- `scripts/coverage-gate.mjs:72` — final `process.exit(failed > 0 ? 1 : 0)`
- `tests/defaults/sync-defaults-guard.test.ts:1–25` — canonical imports + spawnSync helper pattern
- `tests/defaults/sync-defaults-guard.test.ts:29–57` — canonical mkdtemp + try/finally cleanup pattern
- `package.json:25` — test command (no explicit file list → auto-discovery)
- `package.json:27` — test:coverage excludes `scripts/**`

## Open Questions

None. SPEC and codebase are fully consistent. The 6-entry FLOORS constraint and absolute-path
normalization mechanics are documented above with enough precision to write the test file without
further investigation.
```
