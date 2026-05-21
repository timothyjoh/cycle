Enough context gathered. Writing the research document to stdout now.

```markdown
# Research: Cycle 0206

## Cycle Context

SPEC asks for a `stripFences(s: string): string` pure helper that strips markdown code-fence wrappers (` ```json ` or bare ` ``` ` opener + ` ``` ` closer) and applies it unconditionally before the `JSON.parse` call at `src/engine/triage.ts:394` inside `validateOutput`. The function must pass through fence-free input unchanged (exact identity). Unit tests must cover four cases: no-fence passthrough, ` ```json ` wrapped, bare ` ``` ` wrapped, whitespace-padded variants. The 95% per-file coverage floor for `src/engine/triage.ts` must hold.

## Current Codebase State

### Relevant Components

- **`validateOutput` function**: `src/engine/triage.ts:385–578` — exported function; receives `rawStdout: string` as first parameter and calls `JSON.parse(rawStdout)` at line 394 inside a `try/catch`. Returns `{ ok: true; parsed: TriageOutput }` or `{ ok: false; reason: string }`. This is the sole call site requiring the fence strip.

- **`log-fmt.ts`**: `src/engine/log-fmt.ts:1–3` — single-export module containing only `truncateHeadCapped(s, max)`. Already imported in `triage.ts` at line 20: `import { truncateHeadCapped } from './log-fmt.ts'`. A second export (`stripFences`) could be added here, or the helper could be local to `triage.ts`.

- **Triage prompt (cycle 0205 output)**: `src/defaults/prompts/triage.md` — contains explicit no-fences instruction: `"Do NOT wrap output in markdown code fences or backtick blocks. Output the JSON object directly with no surrounding characters."` This is the prompt-level first line of defense; `stripFences` is the code-side fallback.

### Existing Patterns to Follow

- **Pure string helpers in `log-fmt.ts`**: `truncateHeadCapped` is a pure `string → string` function with no side effects, exported from `log-fmt.ts`. `stripFences` would fit the same pattern if placed there. — `src/engine/log-fmt.ts:1`

- **Local helpers in `triage.ts`**: Several private async helpers (`atomicWrite`, `bumpAttempts`, `moveToFailed`, `rewriteOrdering`) live directly in `triage.ts`. A local `stripFences` is also consistent.

- **`validateOutput` first-arg usage**: `rawStdout` flows directly into `JSON.parse(rawStdout)` at line 394 with no pre-processing. The strip is applied as `JSON.parse(stripFences(rawStdout))`. — `src/engine/triage.ts:394`

- **Node native test runner**: All tests use `import { test } from "node:test"` and `import { strict as assert } from "node:assert"`. No external test framework.

- **Validator test file pattern**: `tests/engine/triage-validator.test.ts` tests `validateOutput` directly with inline JSON strings, using a `checkReject` helper and `assert.equal(r.ok, false/true)`. New `stripFences` unit tests should either live here or in a sibling file. — `tests/engine/triage-validator.test.ts:1`

- **Import style**: Named imports, no default exports. `validateOutput` is already exported — `stripFences` should be exported if placed in `log-fmt.ts`, or exported from `triage.ts` if local (for testability).

### Dependencies & Integration Points

- `src/engine/triage.ts` imports `truncateHeadCapped` from `./log-fmt.ts` (line 20). If `stripFences` goes into `log-fmt.ts`, one import line change in `triage.ts` is needed (add to the named import list).

- `validateOutput` is imported and exercised directly in `tests/engine/triage-validator.test.ts:3`. Tests calling `validateOutput(JSON.stringify(j), ...)` will automatically exercise any pre-processing added inside `validateOutput`.

- `tests/defaults/triage-prompt-no-fences.test.ts` — already guards the cycle 0205 prompt instruction. No changes needed to this file.

- `npm run sync-defaults` — not needed; SPEC says no prompt changes.

- `scripts/coverage-gate.mjs:13` — `"src/engine/triage.ts": 95` floor enforced. Adding a helper and its tests must keep line coverage ≥ 95%.

### Test Infrastructure

- **Framework**: Node native test runner (`node:test` + `node:assert`).
- **Layout**: `tests/engine/` for engine unit tests, `tests/defaults/` for prompt/default snapshot tests. Test file names mirror the source module (e.g., `triage-validator.test.ts` tests `validateOutput`).
- **Mocking**: `TriageDeps.runAgent` injectable via `deps` parameter; validator tests inject inline strings directly — no mocking needed for `stripFences` unit tests.
- **Coverage of change area**: `src/engine/triage.ts` is gated at 95% line coverage via `scripts/coverage-gate.mjs`. `tests/engine/triage-validator.test.ts` provides dense coverage of `validateOutput`. The "rejects malformed JSON" test (line 50–52) exercises line 394 today; after the change, that test still exercises the `JSON.parse` path (the stripped string is also not valid JSON in that test).

## Code References

- `src/engine/triage.ts:385` — `validateOutput` function signature: `export function validateOutput(rawStdout: string, raws, queueRows, cfg, todoIds)`
- `src/engine/triage.ts:393–396` — `try { parsed = JSON.parse(rawStdout); } catch (e) { return { ok: false, reason: ... }; }` — the exact insertion point for `stripFences`
- `src/engine/triage.ts:20` — `import { truncateHeadCapped } from './log-fmt.ts';` — existing import from log-fmt
- `src/engine/log-fmt.ts:1–3` — `truncateHeadCapped` is the only current export; 3-line file
- `tests/engine/triage-validator.test.ts:50–52` — "rejects malformed JSON" test: `checkReject("not json", [], "not valid JSON")` — exercises the parse path
- `tests/engine/triage-validator.test.ts:42–48` — `checkReject` helper pattern used across all rejection tests
- `scripts/coverage-gate.mjs:13` — `"src/engine/triage.ts": 95` per-file floor

## Open Questions

- **Placement decision**: SPEC leaves placement open — `src/engine/triage.ts` (local) or `src/engine/log-fmt.ts` (shared). Planner must choose: local keeps it triage-specific (SPEC says "Out of Scope: applying to other steps"); shared is consistent with the `truncateHeadCapped` precedent. Either is valid per SPEC.
- **Export requirement**: If `stripFences` is placed in `log-fmt.ts`, it is trivially importable for tests. If local to `triage.ts`, it needs to be exported (or tests must call `validateOutput` with fenced input as an indirect test). Planner should decide whether to test `stripFences` directly (requires export) or only via `validateOutput` round-trip.
- **Exact regex pattern**: SPEC says strip ` ```json ` or bare ` ``` ` opener and ` ``` ` closer. Whether the regex should also handle `\r\n` line endings or other fence variants (e.g., `~~~`) is not specified; planner should decide based on observed failure data.
```
