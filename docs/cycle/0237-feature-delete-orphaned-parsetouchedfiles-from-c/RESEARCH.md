# Research: Cycle 0237

## Cycle Context

Cycle 0237 removes `parseTouchedFiles` — a dead-code export in `src/engine/commit-cycle.ts` (lines 15–33) that parsed the `## Touched Files` YAML block from agent-authored BUILD.md artifacts. Cycle 0227 replaced that mechanism with engine-owned `touched.json`, leaving the function with no production caller. Three dedicated unit tests (lines 424–463 in `tests/engine/commit-cycle.test.ts`) are also deleted. No replacement is written; this is a pure deletion cycle. Cycle 0236 (artifactDir threading) must already be merged — this cycle operates on the post-0236 state of `commit-cycle.ts`.

## Current Codebase State

### Relevant Components

- **`parseTouchedFiles` function**: `src/engine/commit-cycle.ts:15–33` — exported async function, reads a file path, splits on `\n`, finds `## Touched Files` section header, collects `- item` bullet lines until next `##`. Returns `string[] | null`. No production caller exists anywhere in `src/`.
- **`commitCycle` function**: `src/engine/commit-cycle.ts:126–198` — the active production function. Reads `touched.json` via `opts.artifactDir` (post-0236, line 143–149). `parseTouchedFiles` is not called here.
- **`buildClosesBlock` function**: `src/engine/commit-cycle.ts:90–124` — also exported; unrelated to this cycle.
- **Test import line**: `tests/engine/commit-cycle.test.ts:7` — named import `{ commitCycle, buildClosesBlock, parseTouchedFiles }`. Must drop `parseTouchedFiles` from this destructure after deletion.
- **Test block**: `tests/engine/commit-cycle.test.ts:424–463` — three `test()` calls grouped under `// --- parseTouchedFiles unit tests ---` comment at line 424. Tests use `mkdtemp`/`writeFile`/`rm` from `node:fs/promises` (already imported for other tests at line 3).
- **Issue file**: `docs/cycle/issues/todo/refl-0227-parsetouchedfiles-is-orphaned-in-commit.md` — confirms no production caller, identifies lines 15–33 and 424–463 as the full deletion scope.

### Existing Patterns to Follow

- **Deletion-only cycles**: No stubs, no comment remnants. SPEC requirement: `parseTouchedFiles` must be entirely absent with no comment reference left behind.
- **Import cleanup**: When an exported symbol is deleted from source, its named import in the test file must be removed from the destructure simultaneously. The test file currently imports: `{ commitCycle, buildClosesBlock, parseTouchedFiles }` at line 7 — after deletion, `parseTouchedFiles` is removed from that import list.
- **Coverage floor**: `src/engine/commit-cycle.ts` has a 95% line floor enforced by `scripts/coverage-gate.mjs`. Removing both the function (19 lines, lines 15–33) and its three dedicated tests preserves the ratio because both sides of the coverage equation drop proportionally.

### Dependencies & Integration Points

- **`node:fs/promises` import**: `src/engine/commit-cycle.ts:3` imports `readFile` from `node:fs/promises`. Post-deletion, `readFile` remains used by `commitCycle` (line 145) and `buildClosesBlock` (line 99) — the import stays.
- **No other modules import `parseTouchedFiles`**: `grep -r "parseTouchedFiles" src/` returns only the definition at `src/engine/commit-cycle.ts:15`. `grep -r "parseTouchedFiles" tests/` returns only `tests/engine/commit-cycle.test.ts` lines 7, 424–427, 431, 436, 443, 458.
- **`touched.json` mechanism** (post-0227/0236): `commitCycle` now reads `opts.artifactDir + "/touched.json"` directly — entirely separate from `parseTouchedFiles`. This mechanism is unaffected by this cycle.

### Test Infrastructure

- **Framework**: `node:test` with `node:assert` — no external test runner.
- **Test file**: `tests/engine/commit-cycle.test.ts`, 596 lines total, 21 `test()` calls.
- **Tests exercising `parseTouchedFiles`**: exactly 3, at lines 426, 431, 443 (spanning lines 424–463 inclusive with the comment header).
- **Remaining tests after deletion**: 18 tests covering `commitCycle`, `buildClosesBlock`, `stageFiles`, and scope-warning behavior. All unrelated to `parseTouchedFiles`.
- **Mocking approach**: No mock framework. Tests use real `git init` repos created in `mkdtemp` temp directories, cleaned up with `rm({ recursive: true })`.
- **Current test count**: 21 passing. After deletion: 18 tests expected.
- **Coverage**: `src/engine/commit-cycle.ts` currently at ≥ 95% line (per CLAUDE.md floor). The 19-line function and its 3 tests will be removed together; no net coverage change expected.

## Code References

- `src/engine/commit-cycle.ts:1–8` — imports block; `readFile` from `node:fs/promises` survives deletion
- `src/engine/commit-cycle.ts:15–33` — `parseTouchedFiles` full body (19 lines), to be deleted entirely
- `src/engine/commit-cycle.ts:35` — `spawnGit` begins immediately after; becomes new line ~15 after deletion
- `tests/engine/commit-cycle.test.ts:7` — named import destructure containing `parseTouchedFiles`; must be updated to remove it
- `tests/engine/commit-cycle.test.ts:424–463` — 40-line block: comment header + 3 test cases; full block deleted
- `tests/engine/commit-cycle.test.ts:465` — `// --- commitCycle commit.scope_warning tests ---` comment; becomes next section header after deletion
- `docs/cycle/issues/todo/refl-0227-parsetouchedfiles-is-orphaned-in-commit.md` — source issue confirming scope and rationale

## Open Questions

None. The deletion scope is fully bounded: one function (lines 15–33 in source), one import name (line 7 in tests), one comment + three test cases (lines 424–463 in tests). No ambiguity about callers, no coverage risk, no downstream consumers.
