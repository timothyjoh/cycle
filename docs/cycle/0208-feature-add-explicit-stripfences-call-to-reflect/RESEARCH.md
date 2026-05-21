All context gathered. Writing the research document to stdout.

---

# Research: Cycle 0208

## Cycle Context

SPEC.md asks for one targeted hardening of `src/engine/reflection.ts`: add `s = stripFences(s)` as the very first statement inside `parseWithRepair`, and import `stripFences` from `./log-fmt`. Today, `parseWithRepair` relies on `trimToLastBalancedClose` scanning forward to the first `{` or `[` to incidentally skip any fence prefix — a fragile implicit contract that breaks when prose containing a `{` appears before the fence opener. The fix makes fence removal an explicit, documented first step, mirroring the pattern already established in `triage.ts:validateOutput`. One new unit test for the prose-with-brace hazard case is also required.

## Current Codebase State

### Relevant Components

- **`parseWithRepair` function** — internal to `src/engine/reflection.ts`, lines 131–143. Accepts a trimmed string, attempts direct `JSON.parse`, falls back to `trimToLastBalancedClose` on failure. No import of `stripFences` or `log-fmt` exists today.
- **`ingestReflection` outer pre-strip** — `src/engine/reflection.ts:36–38`. The outer `ingestReflection` function does its own fence strip via `FENCE_RE` (`/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/`) on `stdout.trim()` before calling `parseWithRepair`. This path handles the clean "only fence, nothing else" case.
- **`FENCE_RE` constant** — `src/engine/reflection.ts:10`. Pattern `/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/`. Narrow: requires fence to be the entire string. Misses leading/trailing prose cases.
- **`trimToLastBalancedClose`** — `src/engine/reflection.ts:145–184`. Scans `s` for the first `{` or `[`, then walks forward tracking depth to find the last balanced close. Returns the substring or `null`. Currently provides incidental fence skip only when the fence opener contains no `{`.
- **`stripFences` function** — `src/engine/log-fmt.ts:5–8`. Pattern `/^```(?:\w+)?\r?\n([\s\S]*?)\r?\n```$/` on `s.trim()`. Returns inner content or original string unchanged. Already exported; handles any language tag or bare triple-backtick fence. Added in cycle 0206; widened to any `\w+` tag in cycle 0207.
- **`truncateHeadCapped`** — `src/engine/log-fmt.ts:1–3`. Also exported; used elsewhere but not relevant to this change.
- **`validateOutput` in triage** — `src/engine/triage.ts:385–397`. Calls `JSON.parse(stripFences(rawStdout))` directly as its first parse attempt. This is the established pattern to replicate in `parseWithRepair`. Import at `triage.ts:20`: `import { truncateHeadCapped, stripFences } from './log-fmt.ts'`.

### Existing Patterns to Follow

- **Explicit `stripFences` first call**: `triage.ts:394` — `parsed = JSON.parse(stripFences(rawStdout))`. The planner should mirror this: `s = stripFences(s)` as the first statement in `parseWithRepair`, before the `try { JSON.parse(s) }` block.
- **Import style**: `triage.ts:20` — named import `{ truncateHeadCapped, stripFences }` from `'./log-fmt.ts'` with `.ts` extension (project uses `--experimental-strip-types`).
- **Test structure**: `tests/engine/reflection.test.ts` — each test uses `async function setupRepo()` returning a temp dir, and `makeLogger()` returning `{ events, logger }`. Tests call `ingestReflection(root, CID, SLUG, stdout, logger)` and assert on the return value and emitted events. All tests clean up with `rm(root, { recursive: true, force: true })` in `finally`.
- **`expectExactlyOne` helper**: `tests/engine/reflection.test.ts:8` — imported from `../helpers.ts`. Used for events that must fire exactly once (e.g. `reflection.summary`). New test should follow this pattern.
- **Cardinality pinning**: CLAUDE.md convention — use `filter(...).length === 1` or `expectExactlyOne` for exactly-once events, not `find`.

### Dependencies & Integration Points

- `src/engine/log-fmt.ts` — exports `stripFences`; no circular dependency risk (log-fmt has no imports).
- `src/engine/reflection.ts` — currently imports from `node:fs/promises`, `node:path`, `../issue/id.ts`, `./frontmatter.ts`, `./log.ts`. Adding `./log-fmt.ts` is a new import.
- `tests/engine/reflection.test.ts` — tests `ingestReflection` only (exported function); `parseWithRepair` is internal/unexported. Tests exercise `parseWithRepair` indirectly through `ingestReflection`.
- `tests/helpers.ts` — provides `expectExactlyOne(events, eventName)`.

### Test Infrastructure

- **Framework**: Node built-in test runner (`node:test`, `node:assert`). No Jest/Vitest.
- **File**: `tests/engine/reflection.test.ts`. Currently 24+ test cases, all at the `ingestReflection` level.
- **Mocking approach**: No module mocks. Logger is a plain in-memory stub (`makeLogger()`). Filesystem operations use real temp dirs via `mkdtemp`.
- **Coverage for `src/engine/reflection.ts`**: Per-file floor is 95% (CLAUDE.md, enforced by `scripts/coverage-gate.mjs`). Current test suite achieves this; the new test must not regress it.
- **Coverage for `src/engine/log-fmt.ts`**: Per-file floor is 100% (already met). The change adds an import but no new code to `log-fmt.ts`; coverage is unaffected.
- **Test run command**: `npm test` (builds first). Coverage: `npm run test:coverage` followed by automatic `npm run check:coverage`.

## Code References

- `src/engine/reflection.ts:1–10` — Imports and module-level constants including `FENCE_RE`
- `src/engine/reflection.ts:131–143` — `parseWithRepair`: the function to modify
- `src/engine/reflection.ts:145–184` — `trimToLastBalancedClose`: internal helper, not to be changed
- `src/engine/reflection.ts:36–40` — Outer pre-strip in `ingestReflection` via `FENCE_RE` (separate path from `parseWithRepair`)
- `src/engine/log-fmt.ts:5–8` — `stripFences(s)` implementation
- `src/engine/triage.ts:20` — Import pattern for `stripFences` to mirror
- `src/engine/triage.ts:394` — Call-site pattern for `stripFences` to mirror
- `tests/engine/reflection.test.ts:1–30` — Test file preamble: imports, `makeLogger`, `setupRepo`, constants
- `tests/engine/reflection.test.ts:146–164` — Existing test: "leading prose + fenced JSON + trailing prose recovers via repair pass" — closest existing coverage to the new hazard case; the new test adds the prose-with-brace variant

## Open Questions

- None. SPEC is fully scoped: one import, one statement, one test. All dependencies are confirmed present and exported.
