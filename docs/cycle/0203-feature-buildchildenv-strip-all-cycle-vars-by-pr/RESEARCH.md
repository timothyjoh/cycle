Enough context gathered. Writing the research document.

```markdown
# Research: Cycle 0203

## Cycle Context

Cycle 0203 replaces the per-name destructure in `src/engine/child-env.ts` (which strips only `CYCLE_TRUNK_BASED`) with a prefix-based filter that drops every `CYCLE_*` var from the base environment. Two new unit tests must assert (a) all `CYCLE_*` vars are absent from child env and (b) explicitly injected `cycleEnv` entries still appear. Scope is strictly `child-env.ts` + its test file.

## Current Codebase State

### Relevant Components

- **`buildChildEnv`**: sole export of `src/engine/child-env.ts`. Builds the env map passed to every subprocess. Currently strips only `CYCLE_TRUNK_BASED` via destructure (line 31). Takes `extra: Record<string, string>` (caller-supplied overlays). Called by `execBashStep` and `execStep` (run-cycle.ts). — `src/engine/child-env.ts:16`

- **`cycleEnv` injection in `run-cycle.ts`**: Lines 207–213 build a `Record<string, string>` containing `CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_BASE`, and optionally `CYCLE_ISSUE_ID`. This object is passed as `extra` to `buildChildEnv` (via step executors) so those vars reach subprocesses via explicit opt-in, not process.env passthrough. — `src/engine/run-cycle.ts:207`

- **`CYCLE_TRUNK_BASED` read site**: `src/engine/workflow.ts:86` reads `env.CYCLE_TRUNK_BASED` from the config-load env (i.e., `process.env` at `loadConfig` call time), not from a subprocess env. `cli.ts:137` sets `process.env.CYCLE_TRUNK_BASED = "1"` immediately on `--trunk` flag before any subprocess is spawned. This read path is unaffected by the `buildChildEnv` change. — `src/engine/workflow.ts:86`, `src/cli.ts:137`

- **`execBashStep`**: passes caller-supplied `cycleEnv` directly as `extra` to `buildChildEnv`. — `src/engine/run-cycle.ts:294`

- **`execStep` (agent runners)**: pass `cycleEnv` as `env` to each `runStep` call. — `src/engine/run-cycle.ts:298`

### Existing Patterns to Follow

- **Destructure-then-spread**: current stripping pattern is `const { CYCLE_TRUNK_BASED: _t, ...baseEnv } = process.env as Record<string, string | undefined>` then `return { ...baseEnv, ...extra, PATH: path }` — `src/engine/child-env.ts:31–32`. The replacement must produce the same shape.

- **Test file structure**: `tests/engine/child-env.test.ts` uses Node's built-in `node:test` + `node:assert/strict`. No external test runner, no mocking library. Tests mutate `process.env` directly (with save/restore in `try/finally`) to simulate env state. — `tests/engine/child-env.test.ts:18–25`

- **Coverage floors**: `scripts/coverage-gate.mjs` FLOORS table at line 12. `src/engine/child-env.ts` has **no floor entry** currently. If a floor is needed it must be added to that table. (Peer modules `path-utils.ts` and `engine-lock.ts` are at 100%.) — `scripts/coverage-gate.mjs:12–25`

### Dependencies & Integration Points

- `buildChildEnv` is imported by `src/engine/exec-bash.ts` (direct call) and indirectly by agent exec modules via `run-cycle.ts`. No other callers exist.
- `CYCLE_TRUNK_BASED`: only one read site in the engine (`workflow.ts:86`), which reads from `process.env` (set by `cli.ts:137` before subprocess creation), not from child env. Stripping it from child env is safe.
- `process.env` cast: current code casts `process.env as Record<string, string | undefined>`. The replacement `Object.entries(process.env).filter(...)` must preserve the same type output to keep `buildChildEnv`'s return type (`NodeJS.ProcessEnv`) consistent.

### Test Infrastructure

- **Framework**: Node.js built-in `node:test` + `node:assert/strict`. Run via `npm test` (builds first) or `npm run test:coverage` for LCOV output.
- **Test file**: `tests/engine/child-env.test.ts` — 4 tests covering: PATH prepend, PATH ordering, overlay merge, subprocess Node version. No existing test for `CYCLE_*` stripping. — `tests/engine/child-env.test.ts:9–47`
- **Coverage floor**: none for `src/engine/child-env.ts` in FLOORS table. Adding two new tests will only improve coverage.
- **Test env mutation pattern**: tests save/restore `process.env.PATH` via `try/finally` — `tests/engine/child-env.test.ts:18–25`. New tests for CYCLE_* stripping must follow the same save/restore pattern when setting CYCLE_* vars on `process.env`.

## Code References

- `src/engine/child-env.ts:31` — current per-name destructure: `const { CYCLE_TRUNK_BASED: _t, ...baseEnv } = process.env as Record<string, string | undefined>`
- `src/engine/child-env.ts:32` — spread return: `return { ...baseEnv, ...extra, PATH: path }`
- `src/engine/run-cycle.ts:207–213` — `cycleEnv` construction (CYCLE_ID, CYCLE_TITLE, CYCLE_BASE, CYCLE_ISSUE_ID)
- `src/engine/run-cycle.ts:294` — `execBashStep(repoRoot, step.command!, cycleEnv)` — cycleEnv passed as extra
- `src/engine/run-cycle.ts:298` — `runStep({ ..., env: cycleEnv, ... })` — cycleEnv passed as env
- `src/engine/workflow.ts:86` — `env.CYCLE_TRUNK_BASED === "1"` read from process.env at config load, not child env
- `src/cli.ts:137` — `process.env.CYCLE_TRUNK_BASED = "1"` set before loadConfig/subprocess creation
- `tests/engine/child-env.test.ts:1–47` — existing 4 tests; no CYCLE_* stripping tests
- `scripts/coverage-gate.mjs:12–25` — FLOORS table; no child-env.ts entry

## Open Questions

- Should a coverage floor be added for `src/engine/child-env.ts` in `scripts/coverage-gate.mjs`? The issue and SPEC don't mention it. The issue says "coverage floor for `child-env.ts` maintained" but no floor currently exists in the gate. Planner should decide: add a floor (e.g. 100%) or leave it without a hard floor.
- The `process.env` cast in the replacement: the issue prescribes `Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CYCLE_')))` which returns `Record<string, string>`, dropping `undefined` values (since `Object.entries` on `NodeJS.ProcessEnv` can produce `string | undefined`). Planner should confirm the cast strategy to maintain type safety and match `NodeJS.ProcessEnv` return type.
```
