# Research: Cycle 0242

## Cycle Context

This cycle adds a post-condition assertion to every test in `tests/engine/triage-priority.test.ts` that calls `parkForDiscussion`, confirming that `docs/cycle/issues/raw/<id>.md` no longer exists after the operation. Without the assertion, a regression replacing `rename` with `copyFile` (without a paired `unlink`) passes silently. No changes to `src/` are required.

## Current Codebase State

### Relevant Components

- **`parkForDiscussion` implementation**: `src/engine/triage.ts:707–728` — async function, takes `(repoRoot, raw, log)`. Calls `mkdir` for `docs/cycle/issues/discuss/`, then calls `rename(raw.srcPath, destPath)` inside a try/catch. If `renamed` is true, emits `issue.parked_for_discussion` log event with `{ id, priority: "discuss", path }`. The `raw.srcPath` is the source path of the raw file (under `docs/cycle/issues/raw/<id>.md`).

- **`runTriage` caller of `parkForDiscussion`**: `src/engine/triage.ts:194–196` — when `raw.fm.priority === "discuss"`, calls `await parkForDiscussion(repoRoot, raw, log)` and `continue`s the loop. The raw object carries `raw.srcPath` and `raw.id`.

- **Test file under modification**: `tests/engine/triage-priority.test.ts:1–374` — 7 tests, uses Node `node:test`, `node:assert`, `node:fs/promises`. Already imports `readFile` and `readdir`. Tests use a temp directory (`mkdtemp`) cleaned up in `finally` blocks via `rm`.

### Tests That Call `parkForDiscussion` (via `runTriage` with `priority: discuss`)

Four tests exercise the `discuss` path:

1. **"discuss raw: agent never called…"** — `tests/engine/triage-priority.test.ts:163–205`. Single discuss raw (`id = "test-discuss-01"`). Asserts: agent not called, `discuss/<id>.md` content preserved, no todo file, no queue row, `issue.parked_for_discussion` event. **Missing**: raw `docs/cycle/issues/raw/<id>.md` absence assertion.

2. **"discuss raw moved back to raw/ with priority: medium…"** — `tests/engine/triage-priority.test.ts:244–279`. First run parks `id = "test-roundtrip-01"` as discuss. Asserts `discussPath` exists (line 257) via `readFile`. **Missing**: raw absence assertion after the first `runTriage` call.

3. **"discuss + all normal fail → engine.paused…"** — `tests/engine/triage-priority.test.ts:281–326`. Parks `discussId = "test-allfail-discuss"`. Asserts discuss file exists (line 321–322). **Missing**: raw absence assertion.

4. **"mixed batch: discuss raw parked, normal raw triaged"** — `tests/engine/triage-priority.test.ts:328–374`. Parks `discussId = "test-mixed-discuss"`. Asserts discuss file exists (line 363–364). **Missing**: raw absence assertion.

### Existing Patterns to Follow

- **ENOENT assertion pattern (SPEC suggestion)**: `await assert.rejects(() => readFile(join(root, 'docs/cycle/issues/raw', id + '.md'), 'utf8'), { code: 'ENOENT' })` — `readFile` is already imported at line 5 of the test file; `join` already imported at line 12.

- **`readdir`-based absence pattern (also acceptable)**: read `docs/cycle/issues/raw/` with `readdir` and assert no file starts with `id`. `readdir` already imported at line 8.

- **Existing positive-file assertions**: tests use `await readFile(discussPath, "utf8")` as an implicit existence check (throws if not found) — lines 185–186, 257, 322, 364. The absence assertion mirrors this pattern but uses `assert.rejects`.

- **Temp-dir cleanup**: all tests use `try/finally` with `rm(root, { recursive: true, force: true })`. No pattern change needed.

- **`makeLogCapturing` vs `makeLog`**: tests that assert on events use `makeLogCapturing` (lines 44–52). Tests 1, 3, 4 already use `makeLogCapturing`. Test 2 (roundtrip) uses `makeLog` for both log1 and log2 — if raw absence is asserted via `readFile`/ENOENT no log changes are needed.

### Dependencies & Integration Points

- `raw.srcPath`: the full path to the raw file. For all test setups it resolves to `join(root, "docs/cycle/issues/raw", id + ".md")` — set by `loadRaws` in triage.ts, not directly constructed in tests; the test writes to that path and the assertion must reconstruct the same path.
- `rename` in `parkForDiscussion` (`src/engine/triage.ts:717`): this is the operation whose absence (replaced by `copyFile`) the new assertion must detect.
- No changes to `src/engine/triage.ts` are in scope.

### Test Infrastructure

- **Framework**: `node:test` with `node:assert/strict`
- **Test file location**: `tests/engine/triage-priority.test.ts`
- **No mocking framework**: test doubles are inline function objects (`runAgent: async () => …`)
- **Filesystem**: real temp directories via `mkdtemp`; all FS imports from `node:fs/promises`
- **Coverage floor**: `src/engine/triage.ts` has a 95% floor (`scripts/coverage-gate.mjs:13`). The change is test-only; the floor is not at risk of decrease. No per-file floor exists for `tests/engine/triage-priority.test.ts` — test files are not coverage targets.
- **Run commands**: `npm test` (full suite), `npm run test:coverage && npm run check:coverage` (coverage gate)

## Code References

- `src/engine/triage.ts:707–728` — `parkForDiscussion`: `mkdir` discuss dir, `rename(raw.srcPath, destPath)`, conditional log emit
- `src/engine/triage.ts:194–196` — caller: `if (raw.fm.priority === "discuss") { await parkForDiscussion(…); continue; }`
- `tests/engine/triage-priority.test.ts:1–10` — imports: `readFile`, `readdir`, `rm`, `mkdir`, `writeFile` from `node:fs/promises`; `join` from `node:path`
- `tests/engine/triage-priority.test.ts:163–205` — Test 3 ("discuss raw: agent never called…") — primary target; `id = "test-discuss-01"`
- `tests/engine/triage-priority.test.ts:244–279` — Test 5 (roundtrip) — second `parkForDiscussion` call; `id = "test-roundtrip-01"`
- `tests/engine/triage-priority.test.ts:281–326` — Test 6 ("discuss + all normal fail") — `discussId = "test-allfail-discuss"`
- `tests/engine/triage-priority.test.ts:328–374` — Test 7 ("mixed batch") — `discussId = "test-mixed-discuss"`
- `scripts/coverage-gate.mjs:13` — `"src/engine/triage.ts": 95` floor

## Open Questions

- Test 2 (roundtrip, line 244): the `parkForDiscussion` call happens in the first `runTriage` invocation (log1). The raw file is explicitly re-written at line 260 (`await writeFile(rawPath, …)`), which restores the raw path before the second run. The absence assertion should be placed between the first `runTriage` call (line 253) and the re-write (line 260). Whether `assert.rejects` or a `readdir`-based check is preferred is not specified; either satisfies the SPEC requirement.
- The SPEC says "every test … that calls `parkForDiscussion`" — this includes the roundtrip test's first triage run. The planner should confirm this interpretation covers all 4 tests identified above.
