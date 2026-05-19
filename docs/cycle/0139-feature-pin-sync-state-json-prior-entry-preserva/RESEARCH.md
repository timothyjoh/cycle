Need write permission. Let me output the document to stdout as specified.

---

```markdown
# Research: Cycle 0139

## Cycle Context

SPEC asks for one new regression-pin test in `tests/defaults/sync-defaults-guard.test.ts` that seeds `.cycle/.sync-state.json` with a pre-existing entry for a divergent path (`.cycle/workflows.yml`) and a non-divergent path, runs the script, and asserts both entries survive byte-identical after the run. Exit code must be `2`. No production code changes. Closes the gap left by the existing `state recording omits skipped paths` test, which starts from empty state and cannot distinguish "entry preserved" from "entry never written."

---

## Current Codebase State

### Relevant Components

- **Script under test**: `scripts/sync-defaults.mjs` — copies `src/defaults/` → `.cycle/`, writes `.cycle/.sync-state.json`, guards divergent files.
- **State load**: `loadState()` at `scripts/sync-defaults.mjs:42` — reads `.cycle/.sync-state.json`, returns `{}` on ENOENT, returns `{}` on JSON parse failure.
- **State write**: `writeStateAtomic(state)` at `scripts/sync-defaults.mjs:61` — writes `${JSON.stringify(state, null, 2)}\n` to `.cycle/.sync-state.json.tmp`, then renames atomically.
- **Main loop**: `scripts/sync-defaults.mjs:100–121` — for each `{from, to}` pair: if divergent and not force → `skipped.push(...)` + `continue` (skips `state[to] = ...`); otherwise copies and writes `state[to] = { src_sha256, dst_sha256 }`.
- **Unconditional final write**: `scripts/sync-defaults.mjs:123` — `await writeStateAtomic(state);` — fires regardless of skips. `state` object is the one loaded at line 95 with only non-skipped entries updated; skipped keys retain loaded value verbatim.
- **Exit 2**: `scripts/sync-defaults.mjs:133` — `process.exit(2)` when `skipped.length > 0`.
- **State entry shape written by script**: `{ src_sha256: string, dst_sha256: string }` — **no `synced_at` field**. Any `synced_at` seeded manually survives the skip path untouched.
- **Test file**: `tests/defaults/sync-defaults-guard.test.ts` — 194 lines, 7 existing tests.

### Existing Patterns to Follow

- **`seed()` helper**: `tests/defaults/sync-defaults-guard.test.ts:10–16` — `seed(root, files)` creates dirs and writes files. New test uses this for source + divergent-destination files; writes `.cycle/.sync-state.json` separately with `writeFile`.
- **`runScript()` helper**: `tests/defaults/sync-defaults-guard.test.ts:18–25` — `spawnSync(process.execPath, [SCRIPT], { cwd: root, env, encoding: "utf8" })`. Returns `.status`, `.stdout`, `.stderr`.
- **`HEX64` regex**: `tests/defaults/sync-defaults-guard.test.ts:27` — `/^[0-9a-f]{64}$/`.
- **Test structure**: `mkdtemp` → `seed()` → optional setup → `runScript()` → asserts → `rm(root, { recursive: true, force: true })` in `finally`.
- **Assertion style**: `assert.deepEqual` for objects, `assert.equal` for scalars, `assert.match` for regex.
- **Import set**: all required imports (`mkdir`, `mkdtemp`, `readFile`, `rm`, `writeFile`, `tmpdir`, `dirname`, `join`, `spawnSync`) already present at lines 1–6.
- **Insertion point**: after `state recording omits skipped paths` test ending at line 174; before `per-file granularity` test at line 176.

### Dependencies & Integration Points

- **`loadState()` uses relative `STATE_PATH`**: `scripts/sync-defaults.mjs:19` — `const STATE_PATH = ".cycle/.sync-state.json"`. Script is invoked with `cwd: root`, so seeded state must be at `join(root, ".cycle/.sync-state.json")`.
- **Key format in state**: keys are posix `to` paths — e.g. `.cycle/workflows.yml`, `.cycle/prompts/spec.md`. — `scripts/sync-defaults.mjs:84,104`
- **Divergence check**: `isDivergent = dstExists && dstSha !== srcSha && (recorded ? dstSha !== recorded.dst_sha256 : true)` — `scripts/sync-defaults.mjs:105–108`. With a seeded entry whose `dst_sha256` differs from actual destination content, the path will be divergent (provided destination also differs from source).
- **Re-serialization on write**: `JSON.stringify(state, null, 2)` — V8 preserves insertion order. `assert.deepEqual` handles key-order differences between seed JSON and re-serialized output; raw byte comparison of the full file would not.

### Test Infrastructure

- **Framework**: Node built-in `node:test` + `node:assert/strict`.
- **Runner**: `npm test` — `pretest` builds dist, then `node --experimental-strip-types --test 'tests/**/*.test.ts'`.
- **Coverage**: `npm run test:coverage` → `.cycle/coverage.lcov`; `npm run check:coverage` enforces floors. Floor for `scripts/sync-defaults.mjs` is **90%** line coverage (`scripts/coverage-gate.mjs` FLOORS table).
- **Node version**: must be ≥22.6 (`nvm use 22.22.2` if lower).

---

## Code References

- `scripts/sync-defaults.mjs:42–59` — `loadState()`: ENOENT → `{}`, parse error → `{}`, else returns parsed object
- `scripts/sync-defaults.mjs:61–66` — `writeStateAtomic()`: tmp-write + rename
- `scripts/sync-defaults.mjs:95` — `const state = await loadState();`
- `scripts/sync-defaults.mjs:100–121` — main loop; `continue` on divergent-not-forced skips `state[to] = ...`
- `scripts/sync-defaults.mjs:119` — `state[to] = { src_sha256: srcSha, dst_sha256: newDstSha };` — 2-field shape, no `synced_at`
- `scripts/sync-defaults.mjs:123` — `await writeStateAtomic(state);` — unconditional; preserves skipped entries
- `scripts/sync-defaults.mjs:133` — `process.exit(2)` on any skip
- `tests/defaults/sync-defaults-guard.test.ts:10–16` — `seed()` helper
- `tests/defaults/sync-defaults-guard.test.ts:18–25` — `runScript()` helper
- `tests/defaults/sync-defaults-guard.test.ts:151–174` — `state recording omits skipped paths` — new test inserts after line 174

---

## Open Questions

1. **`synced_at` in seed**: SPEC seed shape includes `synced_at` fields, but the production script writes only `{ src_sha256, dst_sha256 }`. A seeded `synced_at` survives the skip path intact. Planner must decide: include `synced_at` in both seed and expected assertion, or omit it entirely. Either is valid; including it makes the "byte-identical" claim stronger.

2. **Non-divergent seed entry assertion**: SPEC allows "either assertion is valid" — the entry may be overwritten by the script with real sha values, or may match if seeded values happen to equal the computed sha. Simplest approach: assert the non-divergent entry was overwritten with a valid HEX64 sha (same pattern as test at line 50–54) rather than trying to match the seeded placeholder. Planner must pick one approach.
```
