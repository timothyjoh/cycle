# Review: Cycle 0241

## Overall Verdict

PASS — no fixes needed.

## Code Quality Review

### Summary

Both implementation changes are surgical and correct. `parseSnapshotPaths` is extended with a minimal branch that quote-strips and prefix-filters `??` lines before adding them. The scope-warning loop in `commitCycle` removes a single conjunct and relies on the already-present prefix filter at line 145 to exclude non-`src/`/`scripts/` untracked paths. No architectural concerns.

### Findings

1. **Implementation correctness**: `parseSnapshotPaths` `??` branch at `src/engine/run-cycle.ts:45-48` applies `raw.slice(3)` (correct offset for `?? path` format) then quote-strips and prefix-filters. Consistent with the quote-strip pattern on line 55 for the tracked-path branch.

2. **No interaction with rename/copy expansion**: `??` paths `continue` before reaching the `R`/`C` expansion at `src/engine/run-cycle.ts:51-54`. No interaction hazard.

3. **`commitCycle` fallthrough is clean**: After removing `xy === "??"` at `src/engine/commit-cycle.ts:137`, `??` paths reach `raw.slice(3)` (line 138), skip the `R`/`C` expansion (line 139, `xy[0] === "?"` fails both checks), hit quote-strip (line 143), `isDenied` (line 144), and the prefix filter (line 145). No gaps in the fallthrough path.

4. **`appendDocumentationPaths` side-effect**: `parseSnapshotPaths` is also called at `src/engine/run-cycle.ts:76` and `84` inside `appendDocumentationPaths`. Extending the function improves doc-step delta accuracy for untracked `src/`/`scripts/` files. Benign; in scope with PLAN's risk assessment.

5. **Export visibility**: `parseSnapshotPaths` exported at `src/engine/run-cycle.ts:40`. No name collision risk; function was previously unexported and unnamed in tests.

### Spec Compliance Checklist

- [x] `parseSnapshotPaths` called with `?? src/new-file.ts` returns set containing `src/new-file.ts` — `run-cycle.ts:47`
- [x] `parseSnapshotPaths` called with `?? config/foo.json` does not include `config/foo.json` — prefix filter at `run-cycle.ts:47`
- [x] `accumulateTouchedFiles` records newly-created untracked `src/` file in `touched.json` — integration test in `run-cycle.touched-json.test.ts`
- [x] `commitCycle` emits `commit.scope_warning` when `??`-status `src/` path absent from `touched.json` — `commit-cycle.ts:137` (removal) + `commit-cycle.ts:145-148`
- [x] `commitCycle` does not emit `commit.scope_warning` for `??`-status path outside `src/`/`scripts/` — prefix filter at `commit-cycle.ts:145`
- [x] `ENGINE.md` footprint section describes `??` paths under `src/`/`scripts/` now included — `docs/ENGINE.md:155`
- [x] `npm test` passes with all existing tests green — 710 tests, 0 failures
- [x] `npm run check:coverage` passes; per-file floors for `run-cycle.ts` and `commit-cycle.ts` do not regress — `run-cycle.ts` 100%, `commit-cycle.ts` 99.44%
- [x] All existing tests still pass — confirmed
- [x] No compiler/linter warnings — `tsc --noEmit` clean

## Adversarial Test Review

### Summary

Test quality is strong. Unit tests are pure-function, zero-mock. Integration tests use real git repos. The builder identified a non-obvious git behavior (new directory shows as `?? src/` not `?? src/brand-new.ts` until a tracked file exists in the directory) and correctly handled it by committing a seed file first. Cardinality is pinned via `expectExactlyOne` per convention.

### Findings

1. **Quoted-path gap** (`run-cycle.parse-snapshot.test.ts`): The `??` branch at `run-cycle.ts:46` applies quote-stripping (`replace(/^"/, "").replace(/"$/, "")`), but no unit test exercises a quoted untracked path (e.g., `?? "src/file with spaces.ts"`). The code path is correct but untested. Minor; paths with spaces are rare in `src/`.

2. **Git directory-vs-file subtlety handled correctly**: Tests for `commit.scope_warning` on `??` paths pre-commit a seed file in `src/` and `scripts/` so git shows individual file paths rather than directory-level `??` entries. This is the correct fix for the test isolation problem noted in BUILD.md and is confirmed working.

3. **Cardinality pinned correctly**: Both `commit-cycle.test.ts` scope-warning tests that expect a warning use `expectExactlyOne(events, "commit.scope_warning")` — consistent with CLAUDE.md convention. The no-warning test uses `events.filter(e => e.event === "commit.scope_warning").length === 0`.

4. **Integration test fake binary**: The fake `claude` binary in `run-cycle.touched-json.test.ts` creates the file with an absolute path hardcoded via template literal at test-construction time — not at runtime — so the path is stable. The file is created without `git add`, which is the correct setup to produce a `??` entry. Assertion (`content.files.includes("src/untracked.ts")`) is specific.

5. **No mock abuse**: All three test files use real git repos via `mkdtemp`. Zero `spawnSync`/git mocking.

### Test Coverage

- Command run: `npm run test:coverage`
- Line / Branch / Function (all files): 98.64% / 92.28% / 93.36%
- `run-cycle.ts`: 100.00% / 96.27% / 100.00%
- `commit-cycle.ts`: 99.44% / 86.36% / 100.00%
- Regressions vs base (per-file): none — all per-file floors pass
- New code without tests: none
- Specific scenarios missing tests: quoted `??` path (e.g., `?? "src/file with spaces.ts"`) — minor

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "Newly-created untracked files (`??`) under `src/` and `scripts/` are included" | `docs/ENGINE.md:155` | `src/engine/run-cycle.ts:47` — `p.startsWith("src/") \|\| p.startsWith("scripts/")` | OK |
| "untracked paths outside those directories … are excluded" | `docs/ENGINE.md:155` | `src/engine/run-cycle.ts:47` — prefix check excludes all other paths | OK |
| "denylisted paths (`.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`) are excluded" | `docs/ENGINE.md:155` | `src/engine/commit-cycle.ts:144` — `isDenied(p)` (and `src/engine/run-cycle.ts` — denylist applies via `isDenied` in accumulation) | OK |
| Removal of "Known limitation" for `??` exclusion gap | `docs/ENGINE.md:167` (deleted) | Gap fixed at `src/engine/run-cycle.ts:45-48` and `src/engine/commit-cycle.ts:137` | OK |
| Two remaining "Known limitation" blocks (bash-agent, RESET_ELIGIBLE_STEPS) unaffected | `docs/ENGINE.md:167-169` | Both blocks present verbatim at HEAD | OK |
