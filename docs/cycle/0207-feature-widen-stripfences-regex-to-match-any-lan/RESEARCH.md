I have everything needed. Writing the research document to stdout now.

```markdown
# Research: Cycle 0207

## Cycle Context

Cycle 0207 widens the `stripFences` opening-fence regex in `src/engine/log-fmt.ts` from `/^```(?:json)?\r?\n/` to `/^```(?:\w+)?\r?\n/` (case-insensitive for the tag), so that LLM-emitted variants like ` ```javascript `, ` ```text `, ` ```JSON `, and ` ```jsonc ` are stripped before `JSON.parse` in `validateOutput`. Four new unit test cases must be added to `tests/engine/log-fmt.test.ts`, and the "Known limitation" note in `docs/ENGINE.md` must be replaced with an updated description.

## Current Codebase State

### Relevant Components

- **`stripFences` function**: defined at `src/engine/log-fmt.ts:5-8`. Currently 8 lines total. Opening regex on line 6: `/^```(?:json)?\r?\n([\s\S]*?)\r?\n```$/`. Applied via `s.trim().match(...)` — the full block is `match`-extracted with `m[1]` as the inner content, falling back to `s` if no match.

- **`validateOutput` function**: defined at `src/engine/triage.ts:385`. Calls `stripFences(rawStdout)` at `src/engine/triage.ts:394` before passing to `JSON.parse`. This is the only production call site.

- **Import declaration**: `src/engine/triage.ts:20` — `import { truncateHeadCapped, stripFences } from './log-fmt.ts';`

- **Test file**: `tests/engine/log-fmt.test.ts` — 5 existing tests covering: identity passthrough, ` ```json ` opener, bare ` ``` ` opener, leading/trailing whitespace, and CRLF line endings. All use `node:test` + `node:assert` with `assert.equal`.

- **Coverage gate**: `scripts/coverage-gate.mjs:26` — `"src/engine/log-fmt.ts": 100` in the `FLOORS` table. Any line in `log-fmt.ts` not covered by `test:coverage` will fail `check:coverage`.

- **ENGINE.md limitation note**: `docs/ENGINE.md` lines 17-19 — the "Fence handling" block documents the current behavior and names the exact fix (`/^```(?:\w+)?\r?\n/`) in the "Known limitation" sentence. This is the text to remove/update.

### Existing Patterns to Follow

- **Regex structure**: `stripFences` uses a single `match` call with a regex that anchors start (`^`) and end (`$`) of the trimmed string. The opener is the non-capturing group `(?:json)?`. The planner should replace just that group; everything else in the regex stays unchanged.

- **Test style**: `tests/engine/log-fmt.test.ts` — each test builds `inner` as a plain JSON string, concatenates fence delimiters, and calls `assert.equal(stripFences(...), inner)`. New tests should follow the same exact pattern.

- **Test runner**: `node:test` with `import { test } from "node:test"` and `import { strict as assert } from "node:assert"`. No external test libraries.

- **Import path**: test file imports via relative path `../../src/engine/log-fmt.ts` (TypeScript, no transpile step — Node 22 `--experimental-strip-types`).

### Dependencies & Integration Points

- `src/engine/log-fmt.ts` is imported by `src/engine/triage.ts` only. No other production callers of `stripFences` exist in `src/`.
- `tests/engine/log-fmt.test.ts` imports from `src/engine/log-fmt.ts` directly.
- `scripts/coverage-gate.mjs` reads `.cycle/coverage.lcov` produced by `npm run test:coverage`; the 100% floor for `log-fmt.ts` means every line in the file must be exercised.

### Test Infrastructure

- **Test framework**: Node built-in `node:test` + `node:assert` (strict mode).
- **Test command**: `npm test` (runs `pretest` build first, then full suite). Coverage: `npm run test:coverage` → `npm run check:coverage`.
- **Test file location**: `tests/engine/log-fmt.test.ts` (mirrors `src/engine/log-fmt.ts`).
- **Current coverage**: 100% line coverage enforced by coverage gate; all 5 existing tests pass.

## Code References

- `src/engine/log-fmt.ts:6` — Current regex: `/^```(?:json)?\r?\n([\s\S]*?)\r?\n```$/`
- `src/engine/log-fmt.ts:5-8` — Full `stripFences` function body
- `src/engine/triage.ts:20` — Import of `stripFences` from `./log-fmt.ts`
- `src/engine/triage.ts:394` — Only production call site: `JSON.parse(stripFences(rawStdout))`
- `tests/engine/log-fmt.test.ts:1-28` — All 5 existing unit tests; new tests appended here
- `scripts/coverage-gate.mjs:26` — `"src/engine/log-fmt.ts": 100` floor entry
- `docs/ENGINE.md:17-19` — "Fence handling" + "Known limitation" prose; lines 18-19 describe the exact bug and fix

## Open Questions

- The SPEC requires the tag match to be case-insensitive. The proposed regex `/^```(?:\w+)?\r?\n/` without an `i` flag is still case-sensitive (e.g. ` ```JSON ` would match `\w+` but case doesn't matter for `\w`). `\w` matches `[A-Za-z0-9_]` and is inherently case-inclusive — so ` ```JSON ` and ` ```json ` both match `\w+` without needing the `i` flag. The planner should confirm no `i` flag is needed (it is not, since `\w` is already case-agnostic).
- The SPEC acceptance criteria show the output as `{...}` (no trailing newline), but the current implementation returns `m[1]` which is the inner content between the fence delimiters — no trailing newline is included. Test cases should verify this matches the existing pattern (inner string without surrounding newlines).
```
