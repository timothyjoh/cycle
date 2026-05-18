Have all the data needed. Writing the research document now.

```markdown
# Research: Cycle 0138

## Cycle Context

Cycle 0138 removes the `--test-coverage-exclude='scripts/**'` flag from `package.json`'s `test:coverage` command so that `scripts/sync-defaults.mjs` is included in LCOV coverage instrumentation, then adds a new test file `tests/scripts/sync-defaults.test.ts` covering four specific untested branches in the divergence guard. The guard code is data-loss-prevention logic that prevents silent clobber of locally-diverged `.cycle/` files; it has been invisible to coverage since its creation in cycle 0048.

---

## Current Codebase State

### Relevant Components

- **Coverage exclusion flag**: `package.json:27` — `test:coverage` script contains `--test-coverage-exclude='scripts/**'` as the third of three exclude flags. Removing it is a single-flag edit; the other two excludes (`dist/**`, `tests/**`) remain.

- **`scripts/sync-defaults.mjs`**: 135 lines — ESM module, runs as top-level `await` script. Three logical sections:
  1. `loadState()` (lines 42–59): reads `.cycle/.sync-state.json`; returns `{}` on ENOENT or malformed JSON (two distinct catch branches at lines 47 and 55–57).
  2. `discoverPairs()` (lines 68–88): reads `src/defaults/` recursively; returns `[]` on ENOENT (line 73).
  3. Main loop (lines 100–121) + post-loop (lines 123–134): iterates pairs, skips divergent files without force, writes state atomically. Force-overwrite stderr only emitted when `forced.length > 0` (line 125).

- **`scripts/coverage-gate.mjs`**: 73 lines — `FLOORS` table at lines 12–19 currently has six entries:
  ```
  src/engine/triage.ts: 95
  src/engine/issue-lifecycle.ts: 95
  src/engine/commit-cycle.ts: 95
  src/engine/branch.ts: 90
  src/engine/stale-dist.ts: 95
  src/cli/run-one.ts: 70
  ```
  Gate exits 2 if any FLOORS entry is absent from LCOV (line 58–60). Adding `scripts/sync-defaults.mjs` to FLOORS requires the LCOV block to exist, which requires the exclusion to be dropped first.

- **`tests/scripts/coverage-gate.test.ts`**: 129 lines — contains `ALL_SIX_PASSING` fixture at lines 19–26 that includes exactly the current six FLOORS keys. Tests 1 (all floors met, exit 0) and 5 (absolute SF paths) both use `ALL_SIX_PASSING`. Adding a seventh FLOORS entry (`scripts/sync-defaults.mjs`) will cause both of these tests to exit 2 (missing LCOV block) unless `ALL_SIX_PASSING` is extended with the new key.

- **`tests/defaults/sync-defaults-guard.test.ts`**: 193 lines — existing E2E test suite for `scripts/sync-defaults.mjs`. Seven tests using `spawnSync`. Covers: clean sync, re-sync no-op, divergent skip (exit 2), `--force` flag, `CYCLE_SYNC_DEFAULTS_FORCE=1`, state-recording omits skipped paths, per-file granularity. Does NOT cover the four AC branches (see gap analysis below).

### Four AC Branch Gap Analysis

| AC branch | Code location | Covered by existing tests? |
|---|---|---|
| Malformed `.sync-state.json` → `loadState` returns `{}` | `sync-defaults.mjs:50–58` | No — no test pre-creates a corrupt state file |
| Missing `src/defaults/` → `discoverPairs` returns `[]`, exit 0 | `sync-defaults.mjs:71–75` | No — all existing tests seed `src/defaults/` |
| `--force` with zero divergent destinations → no force stderr | `sync-defaults.mjs:125` (`if (force && forced.length > 0)`) | No — existing force tests always have one divergent file |
| Prior state entry preserved when path is skipped | `sync-defaults.mjs:110–113` (loop `continue` skips `state[to] = …`) | No — "state omits skipped" test has no pre-existing state entry for the skipped key |

### Existing Patterns to Follow

- **`spawnSync` + temp dir pattern**: `tests/scripts/coverage-gate.test.ts:28–35` and `tests/defaults/sync-defaults-guard.test.ts:10–24` both use `mkdtemp` + `spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" })` + `rm(root, { recursive: true, force: true })` in a `try/finally`. New tests must match this pattern.

- **`seed()` helper**: `tests/defaults/sync-defaults-guard.test.ts:10–16` defines `seed(root, files)` which `mkdir`s parent dirs and `writeFile`s content from a `Record<string, string>`. New tests can reuse or replicate this pattern.

- **`runScript()` helper**: `tests/defaults/sync-defaults-guard.test.ts:18–25` takes `root` and `opts.force` flag. New file should define its own equivalent helper or can import from the existing file (no shared helper infrastructure exists; inline is the pattern).

- **Node built-in test runner**: all test files use `import { test } from "node:test"` and `import { strict as assert } from "node:assert"`. No third-party test framework.

- **Test file naming/location**: `tests/scripts/` already exists and contains `coverage-gate.test.ts`. New file `tests/scripts/sync-defaults.test.ts` follows the same location convention (script name, not behavior category).

### Dependencies & Integration Points

- **`package.json:27`** → `scripts/coverage-gate.mjs` is invoked via `posttest:coverage` (line 28). Dropping the exclusion flag means LCOV will now include blocks for `scripts/sync-defaults.mjs`, `scripts/coverage-gate.mjs`, and `scripts/build.mjs`. Only `sync-defaults.mjs` enters FLOORS (others are out of scope per SPEC).

- **`tests/scripts/coverage-gate.test.ts` coupling**: `ALL_SIX_PASSING` (line 19) and the absolute-path test (line 104) both reference exactly six FLOORS keys. Adding a seventh key to FLOORS in `coverage-gate.mjs` will break these two tests unless the fixture is extended with `"scripts/sync-defaults.mjs": { lf: 100, lh: 100 }`.

- **Node `--test` discovery**: Neither `test` nor `test:coverage` commands specify a glob; Node's built-in runner discovers `**/*.test.{ts,mjs,js}` recursively from cwd. New file at `tests/scripts/sync-defaults.test.ts` will be auto-discovered.

- **`--experimental-strip-types`**: both `test` and `test:coverage` use this flag. New `.test.ts` files require no build step; TypeScript syntax is stripped at runtime.

### Test Infrastructure

- **Framework**: Node built-in `node:test` + `node:assert`.
- **Temp dirs**: `os.tmpdir()` + `fs/promises.mkdtemp`. macOS resolves `/tmp` → `/private/tmp`; `realpath` used in `coverage-gate.test.ts:110` where absolute paths matter. Not required for sync-defaults tests (no absolute path normalization).
- **Script path**: `const SCRIPT = join(process.cwd(), "scripts/sync-defaults.mjs")` — `process.cwd()` at test runtime is the repo root.
- **Coverage of change area**: `scripts/sync-defaults.mjs` is currently excluded from LCOV entirely. `tests/defaults/sync-defaults-guard.test.ts` exercises it but numbers are unreported. `tests/scripts/coverage-gate.test.ts` has 5 tests covering all significant branches of `coverage-gate.mjs`.

---

## Code References

- `package.json:27` — `test:coverage` script with three `--test-coverage-exclude` flags; third one is `scripts/**`
- `scripts/sync-defaults.mjs:42–59` — `loadState()`: ENOENT → `{}` at line 47; malformed JSON → `{}` at lines 55–57
- `scripts/sync-defaults.mjs:68–88` — `discoverPairs()`: ENOENT → `[]` at line 73
- `scripts/sync-defaults.mjs:100–121` — main pair loop: `continue` at line 112 skips `state[to] = …` at line 119 for divergent+!force
- `scripts/sync-defaults.mjs:123` — `writeStateAtomic(state)` called unconditionally after loop (post-0136 resolved behavior)
- `scripts/sync-defaults.mjs:125–128` — `if (force && forced.length > 0)` guards force stderr; silent when no paths were forced
- `scripts/coverage-gate.mjs:12–19` — `FLOORS` table, six entries
- `scripts/coverage-gate.mjs:57–60` — exits 2 when LCOV block absent for a FLOORS key
- `tests/scripts/coverage-gate.test.ts:19–26` — `ALL_SIX_PASSING` fixture; must gain a seventh entry when FLOORS grows
- `tests/scripts/coverage-gate.test.ts:104–128` — absolute-path test; also uses all-six fixture, must be updated
- `tests/defaults/sync-defaults-guard.test.ts:1–193` — existing sync-defaults E2E suite; not the new file

---

## Open Questions

1. **Floor value for `scripts/sync-defaults.mjs`**: SPEC says "appropriate floor" without a number. With the four new branch tests plus the seven existing E2E tests, line coverage will be high but branch coverage depends on which conditional combos the tests hit. A planner must choose a specific percentage (90 or 95 are the two precedents in FLOORS).

2. **New test file location**: SPEC says `tests/scripts/sync-defaults.test.ts`. The existing E2E suite is at `tests/defaults/sync-defaults-guard.test.ts`. Planner must decide whether to add four new tests to the existing file vs. create a new file at `tests/scripts/`. SPEC is explicit: new file at `tests/scripts/`.

3. **`coverage-gate.test.ts` update scope**: Adding a seventh FLOORS entry breaks `ALL_SIX_PASSING`-based tests 1 and 5. The planner must include updating `coverage-gate.test.ts` in the plan. SPEC does not explicitly mention this; it is a mechanical side effect.

4. **`scripts/coverage-gate.mjs` and `scripts/build.mjs` in LCOV**: Dropping the `scripts/**` exclusion adds all three scripts to LCOV. Only `sync-defaults.mjs` enters FLOORS. The gate will still pass for the other two because they have no FLOORS entry (gate only checks files in FLOORS). Aggregate threshold impact is unknown until coverage runs.
```
