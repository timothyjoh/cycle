I have everything needed. Writing the research document to stdout.

# Research: Cycle 0261

## Cycle Context
SPEC.md (`docs/cycle/0261-feature-fix-ts2339-typecheck-error-in-iteration/SPEC.md`) requires repairing a single, pre-existing red `tsc --noEmit` gate. `npm run typecheck` exits non-zero with exactly one diagnostic: `tests/cli/iteration-too-fast.test.ts(152,46): error TS2339: Property 'length' does not exist on type '{}'`. The offending line is `assert.deepEqual(halts[0].failed_cycles?.length, 1, …)`. The fix is typing-only: narrow the parsed `engine.halted` event at this one read site so `.failed_cycles?.length` type-checks, while preserving the optional chain and the exact assertion semantics ("exactly one failed cycle recorded"). No engine source, no payload shape, no gate-script, and no runtime behavior may change; the blast radius is confined to `tests/cli/iteration-too-fast.test.ts`.

## Current Codebase State

### Relevant Components
- The failing read site: `assert.deepEqual(halts[0].failed_cycles?.length, 1, "one failed cycle recorded")` — `tests/cli/iteration-too-fast.test.ts:152`.
- The local `readEvents` helper that produces the loosely-typed events array: `tests/cli/iteration-too-fast.test.ts:97-100`. It reads `.cycle/log.jsonl`, splits on newlines, and `JSON.parse`s each line, returning `Promise<Array<Record<string, unknown>>>`.
- The `halts` array derived from those events: `tests/cli/iteration-too-fast.test.ts:147-149` — `events.filter((e) => e.event === "engine.halted" && e.reason === "max_consecutive_failures")`. Because the `filter` predicate is not a type guard, `halts` is `Array<Record<string, unknown>>`, so `halts[0]` is `Record<string, unknown>` and `halts[0].failed_cycles` is `unknown` (surfaced by `tsc` as `{}`). `.length` therefore does not type-check.

### Existing Patterns to Follow
- **Loosely-typed log-event parsing**: Every test in this suite reads structured events as `Array<Record<string, unknown>>` and accesses fields by string key (`tests/cli/iteration-too-fast.test.ts:97-100`, `124-152`). Property comparisons like `assert.equal(halts[0].threshold, 1, …)` (`tests/cli/iteration-too-fast.test.ts:151`) type-check fine because `assert.equal` accepts `unknown`; only the member-access `.length` on `unknown` fails. The same `readEvents` → `filter` → index → field-access pattern recurs at lines `124-134`, `138-143`, `147-157`, `203-208`, `253`, `297`. Of all of these, **only line 152 calls a member (`.length`) on a parsed field** — every other site compares the `unknown` value directly via `assert.equal`/`assert.deepEqual`, which is why they do not trip TS2339.
- **In-test cast-to-shape narrowing already used in this file**: `tests/cli/iteration-too-fast.test.ts:134` already narrows an `unknown` field with an inline cast before a member-style operation: `assert.ok((w.duration_ms as number) < 5000)`. The SPEC's suggested fix — `(halts[0] as { failed_cycles?: unknown[] }).failed_cycles?.length` — is the array-bearing analog of this same in-file convention.
- **Cardinality-pinning convention (must be preserved)**: CLAUDE.md mandates `filter(predicate).length === 1` for exactly-once events; this suite follows it for halts (`tests/cli/iteration-too-fast.test.ts:150`, `assert.equal(halts.length, 1, …)`). The line-152 assertion additionally pins the *count of recorded failed cycles* to 1 via `failed_cycles?.length`; the SPEC requires this semantic be preserved byte-for-byte.
- **Optional-chain failure semantics (must be retained)**: The `?.` in `failed_cycles?.length` means a missing `failed_cycles` yields `undefined`, and `assert.deepEqual(undefined, 1, …)` then fails loudly rather than throwing a `TypeError`. SPEC Requirements (lines 39-40) and Acceptance Criteria (line 46) require the optional chain stay intact and the narrowing be honest (narrow `unknown` to `unknown[]`, not a blanket `as any`).
- Failure handling: No runtime failure surface is touched. The only "failure" in scope is the static gate itself; errors surface through the existing `node:assert` calls. Nothing is swallowed.
- Observability: The events under test are the structured `.cycle/log.jsonl` engine events (`engine.halted`, `step.warning`, `cycle.start`, `cycle.restart`, `cycle.end`). The test consumes them read-only via `readEvents`; no logging convention changes.
- Idempotency / retry-safety: Not applicable to a typing-only test change. The behavior under test (iteration-too-fast fast-bail, `max_consecutive_failures` terminal halt) is unchanged.

### Dependencies & Integration Points
- TypeScript config: `tsconfig.json` — `strict: true`, `target`/`lib` `ES2023`, `noEmit: true`, `allowImportingTsExtensions: true`, includes `tests/**/*.ts` (`tsconfig.json:1-19`). `strict` is why `unknown` does not auto-narrow.
- `npm run typecheck` → `tsc --noEmit` (per CLAUDE.md command table); currently the sole reported diagnostic is the line-152 TS2339 (confirmed by running it).
- The `engine.halted { reason: "max_consecutive_failures", threshold, failed_cycles }` event is emitted by the supervisor/halt path; `failed_cycles` is an array (per CLAUDE.md halt-accounting note: `recordTerminalFailure` appends `failedCycles` as a new array). This cycle relies on, but does not modify, that emit.
- No external services, env vars, or new packages.

### Test Infrastructure
- Test framework: `node:test` with `node:assert` (`strict`) — `tests/cli/iteration-too-fast.test.ts:1-2`. Run via `npm test` (auto-builds first via `pretest`) and the static gate `npm run typecheck`.
- Test conventions: CLI integration tests in `tests/cli/`; each test bootstraps a temp git repo (`mkdtemp` + `bootstrapRepo`, `tests/cli/iteration-too-fast.test.ts:16-40`), seeds a todo issue + queue row (`seedTodo`, `42-66`), invokes the built `dist/cycle.js` via `spawnSync("node", [dist, "run", "--skip-preflight"], …)` (`119`), then asserts over parsed `.cycle/log.jsonl` events. Bash steps use inline shell scripts (`INSTANT_FAIL`, `102`). Helpers `expectExactlyOne` live in `tests/helpers.ts:8`.
- Current coverage of the change area: The line-152 assertion is exercised by the test "iteration-too-fast: K=2 instant failures fast-bail with exactly one warning, no third retry" (`tests/cli/iteration-too-fast.test.ts:104`). The typing change does not alter which lines execute.
- Failure-path test coverage: The suite itself is a failure-path suite (instant-failing bash steps, fast-bail, terminal halt). The specific failure-mode the SPEC cares about (a missing `failed_cycles` collapsing to `undefined` and failing the `deepEqual`) is guarded by the retained `?.` optional chain, verifiable by reading the assertion — no new test is required (SPEC Testing Strategy, lines 50-56).

## Code References
- `tests/cli/iteration-too-fast.test.ts:152` — the failing assertion `assert.deepEqual(halts[0].failed_cycles?.length, 1, "one failed cycle recorded")`; sole TS2339 site.
- `tests/cli/iteration-too-fast.test.ts:147-150` — `halts` derivation via untyped `filter`; `halts.length` cardinality pin at line 150.
- `tests/cli/iteration-too-fast.test.ts:97-100` — `readEvents` returning `Array<Record<string, unknown>>` (the source of the `unknown` field types).
- `tests/cli/iteration-too-fast.test.ts:134` — existing in-file inline-cast precedent `(w.duration_ms as number)`.
- `tests/cli/iteration-too-fast.test.ts:151` — `halts[0].threshold` direct `assert.equal` (type-checks; contrast with the `.length` member access at 152).
- `tsconfig.json:7` — `strict: true`, the reason `unknown` does not narrow.

## Open Questions
- None. The SPEC, issue, and code converge on a single read-site narrowing in one file. The exact cast form (e.g. `(halts[0] as { failed_cycles?: unknown[] }).failed_cycles?.length`) is a planning detail constrained by SPEC In-Scope (line 27) and the honesty/optional-chain requirements (lines 39-40); any equivalent array-shaped narrowing that keeps `?.` satisfies the spec.
