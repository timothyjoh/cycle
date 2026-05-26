# Research: Cycle 0255

## Cycle Context

Cycle 0255 creates a new pure utility module `src/engine/rate-limit.ts` that exports an `ExecResult` interface and an `isRateLimitError` function. The function detects rate-limit signals from subprocess execution results by checking for exit code 429 (any output), or exit code 1 combined with stderr/stdout containing `"rate limit"`, `"429"`, or `"Too Many Requests"` (case-insensitive). No existing exec module is wired up; this is a standalone utility with full test coverage. The spec also requires adding a 100% per-file coverage floor to `scripts/coverage-gate.mjs` and documenting the new module in `CLAUDE.md`.

## Current Codebase State

### Relevant Components

- **`StepResult` type**: the existing result shape returned by all exec modules — `{ status: "ok" | "failed"; exitCode: number; stderr: string; stdout: string }` — `src/engine/exec-bash.ts:6-10`. Note `exitCode: number` (never null); the new `ExecResult` interface uses `exitCode: number | null` to represent the broader subprocess contract (child process `close` event can yield `null`).
- **`exec-spawn.ts` actual null handling**: `code ?? -1` collapses null to `-1` before storing in `StepResult` — `src/engine/exec-spawn.ts:42`. So live exec modules never surface `null`; `ExecResult` is deliberately broader for testability.
- **`TriageAgentResult`**: a parallel result shape in triage with `exitCode: number` — `src/engine/triage.ts:23`. Unrelated to the new module.
- **`path-utils.ts`**: canonical example of a pure zero-import engine utility module — `src/engine/path-utils.ts:1-12`.
- **`log-fmt.ts`**: second example of a pure zero-import engine utility module — `src/engine/log-fmt.ts:1-8`.
- **`coverage-gate.mjs` `FLOORS` table**: must be extended with `"src/engine/rate-limit.ts": 100` — `scripts/coverage-gate.mjs:12-31`.
- **`structural-invariants.mjs`**: build-time structural rule enforcer; no new invariant required by SPEC for this cycle — `scripts/structural-invariants.mjs:12-37`.
- **`exec.ts` REGISTRY**: lists all registered exec modules; not touched this cycle — `src/engine/exec.ts:39-46`.

### Existing Patterns to Follow

- **Pure utility module structure**: no imports from external packages; no side effects; named exports only; no default export. See `src/engine/path-utils.ts` and `src/engine/log-fmt.ts`.
- **TypeScript module syntax**: `export interface` / `export function` with `.ts` extension on imports; `verbatimModuleSyntax: true` in `tsconfig.json` so type imports must use `import type` — `tsconfig.json:14`.
- **Test file naming**: `tests/engine/<module-name>.test.ts` mirrors `src/engine/<module-name>.ts` — e.g., `tests/engine/path-utils.test.ts`, `tests/engine/log-fmt.test.ts`.
- **Test runner imports**: `import { test } from "node:test"` and `import assert from "node:assert/strict"` or `import { strict as assert } from "node:assert"` — both forms appear in the test suite.
- **Test structure**: flat `test("description — case", () => { ... })` calls, no `describe` nesting. See `tests/engine/path-utils.test.ts:5-36` and `tests/engine/log-fmt.test.ts:5-56`.
- **Coverage floor registration**: add one entry to the `FLOORS` object in `scripts/coverage-gate.mjs:12-31`. Key is a repo-relative path string; value is the integer percentage floor.
- **`case-insensitive` string matching**: existing pattern in triage uses `.toLowerCase()` and `.includes()` — `src/engine/triage.ts:122`. The SPEC requires case-insensitive matching; `toLowerCase()` + `includes()` or a regex with `i` flag both fit.

### Dependencies & Integration Points

- **No new npm dependencies**: the new module is pure TypeScript using built-in string operations. The only runtime dependency is `node:` stdlib — which the module will not import (no I/O).
- **`CLAUDE.md` Architecture section**: must list `src/engine/rate-limit.ts` in the key-modules list after the new module ships — `CLAUDE.md` (Architecture section, near `src/engine/path-utils.ts` and `src/engine/log-fmt.ts` references).
- **`scripts/coverage-gate.mjs`**: requires a new `FLOORS` entry; the gate reads the LCOV produced by `npm run test:coverage` and exits 1 if the floor is not met — `scripts/coverage-gate.mjs:66-82`.
- **`npm run test:coverage`**: runs node built-in test runner with `--experimental-test-coverage`, excludes `dist/**` and `tests/**` from coverage, writes LCOV to `.cycle/coverage.lcov` — `package.json:27`. `posttest:coverage` then runs both `coverage-gate.mjs` and `structural-invariants.mjs` — `package.json:28`.

### Test Infrastructure

- **Test framework**: Node built-in `node:test` runner with `--experimental-strip-types`. No transpile step. Node ≥ 22.6 required.
- **Test conventions**: one test file per source module under `tests/engine/`; flat `test()` calls; `assert` from `node:assert/strict`; no mocking needed for pure functions.
- **Coverage enforcement**: LCOV-based, per-file floors in `scripts/coverage-gate.mjs`; aggregate floors (line ≥ 95%, branch ≥ 75%, function ≥ 90%) documented in `CLAUDE.md`.
- **Current coverage of the change area**: no `src/engine/rate-limit.ts` exists yet; no existing tests cover it. The new file starts at 0% and must reach 100% to satisfy the SPEC's acceptance criterion and the new floor entry.

## Code References

- `src/engine/exec-bash.ts:6-10` — `StepResult` type definition: `{ status, exitCode: number, stdout, stderr }`
- `src/engine/exec-spawn.ts:40-43` — `child.on("close", (code) => ...)` collapses null via `code ?? -1`
- `src/engine/path-utils.ts:1-12` — canonical pure utility module: no imports, named export, simple logic
- `src/engine/log-fmt.ts:1-8` — second canonical pure utility: no imports, two named exports
- `tests/engine/path-utils.test.ts:1-36` — canonical unit test for a pure utility; flat `test()` structure
- `tests/engine/log-fmt.test.ts:1-57` — more exhaustive unit test showing case-by-case `test()` blocks
- `scripts/coverage-gate.mjs:12-31` — `FLOORS` table to extend with `"src/engine/rate-limit.ts": 100`
- `scripts/coverage-gate.mjs:66-82` — enforcement loop that reads LCOV blocks and compares to floors
- `tsconfig.json:14` — `verbatimModuleSyntax: true`; type-only imports must use `import type`
- `package.json:26-29` — `test`, `test:coverage`, `posttest:coverage`, `check:coverage` script chain
- `src/engine/exec.ts:1-53` — agent registry; not modified this cycle, shown for context only

## Open Questions

- `ExecResult` has `exitCode: number | null`. The SPEC acceptance criteria only test exit codes `429`, `1`, and `0`. Should `null` exitCode (subprocess killed / no exit) return `false`? The SPEC testing strategy mentions "null exit code + matching string (false)" as a case — the planner should implement that branch explicitly.
- The SPEC says detect patterns case-insensitively; it does not specify whether the match must be a substring anywhere in the field or word-bounded. The implementation should use substring containment (`includes` after `toLowerCase()`), consistent with existing triage error-check patterns.
- `CLAUDE.md` key-modules list uses a specific prose format (one module per bullet, em-dash separated). The planner should match the existing format rather than inventing a new one.
