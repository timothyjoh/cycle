# Research: Cycle 0247

## Cycle Context

Cycle 0247 fixes a pre-existing TS2345 typecheck error at `src/cli.ts:241` introduced in commit `ad669f5`. The ternary expression `process.env.CYCLE_TRUNK_BASED === "1" ? { CYCLE_TRUNK_BASED: "1" } : {}` produces the union type `{ CYCLE_TRUNK_BASED: string } | { CYCLE_TRUNK_BASED?: undefined }`, which TypeScript's strict mode correctly rejects as incompatible with `buildChildEnv`'s parameter type `Record<string, string>`. The fix must satisfy the `Record<string, string>` constraint in both branches without changing runtime behavior or using a non-null assertion.

## Current Codebase State

### Relevant Components

- **Fix site — `spawnRunOne` ternary**: `src/cli.ts:236` — `const extra = process.env.CYCLE_TRUNK_BASED === "1" ? { CYCLE_TRUNK_BASED: "1" } : {};`
- **Call site — `buildChildEnv(extra)`**: `src/cli.ts:241` — `{ env: buildChildEnv(extra), stdio: "inherit", shell: false }`
- **`buildChildEnv` signature**: `src/engine/child-env.ts:16` — `export function buildChildEnv(extra: Record<string, string>): NodeJS.ProcessEnv`
- **CYCLE_TRUNK_BASED set in parent**: `src/cli.ts:139` — `if (args.trunk) process.env.CYCLE_TRUNK_BASED = "1";`
- **CYCLE_TRUNK_BASED consumed in child**: `src/engine/workflow.ts:86` — `if (env.CYCLE_TRUNK_BASED === "1") {` — forces trunk commit mode

### The Type Error (exact)

`tsc --noEmit` output:

```
src/cli.ts(241,28): error TS2345: Argument of type '{ CYCLE_TRUNK_BASED: string; } | { CYCLE_TRUNK_BASED?: undefined; }' is not assignable to parameter of type 'Record<string, string>'.
  Type '{ CYCLE_TRUNK_BASED?: undefined; }' is not assignable to type 'Record<string, string>'.
    Property 'CYCLE_TRUNK_BASED' is incompatible with index signature.
      Type 'undefined' is not assignable to type 'string'.
```

The falsy branch `{}` is typed by TypeScript as `{ CYCLE_TRUNK_BASED?: undefined }` when the ternary arms have mismatched key presence under `strict: true`, causing the union to include an optional `undefined`-valued property.

### `buildChildEnv` Signature and Contract

`src/engine/child-env.ts:16-33`:
- Signature: `buildChildEnv(extra: Record<string, string>): NodeJS.ProcessEnv`
- Behavior: strips all `CYCLE_*` vars from `process.env`, prepends parent Node's `bin` dir to `PATH`, then spreads `extra` on top
- The `extra` parameter is `Record<string, string>` — no optional or undefined values permitted
- Signature must not change (SPEC requirement)

### Other `buildChildEnv` Call Sites (all already type-correct)

- `src/engine/exec-spawn.ts:22` — `buildChildEnv(env ?? {})` — always passes `Record<string, string>`
- `src/engine/exec-bash.ts:17` — `buildChildEnv(env)` — parameter typed `Record<string, string>`
- `src/engine/commit-cycle.ts:20,29,84` — `buildChildEnv(envExtra ?? {})` — always passes `Record<string, string>`

### TypeScript Configuration

`tsconfig.json`:
- `"strict": true` — enables `strictNullChecks`, which causes the optional-property mismatch
- `"target": "ES2023"`, `"lib": ["ES2023"]`
- `"noEmit": true`
- `"module": "ESNext"`, `"moduleResolution": "Bundler"`

### Existing Patterns to Follow

- **Nullish-coalescing `?? {}`**: Used at `exec-spawn.ts:22` and `commit-cycle.ts:20,29,84` — callers normalize an optional `Record<string, string>` to a concrete `{}` before passing. This is the established pattern for ensuring `Record<string, string>` compatibility.
- **Conditional object spread**: An alternative that avoids the union: `const extra: Record<string, string> = {}; if (process.env.CYCLE_TRUNK_BASED === "1") extra.CYCLE_TRUNK_BASED = "1";`
- **Explicit type annotation**: Annotating the `const extra` declaration as `Record<string, string>` would widen the inferred type and accept either branch.

### Runtime Semantics to Preserve

- `CYCLE_TRUNK_BASED: "1"` must be in the child env **if and only if** `process.env.CYCLE_TRUNK_BASED === "1"` in the parent.
- The falsy branch must pass an empty record — no extra keys.

## Dependencies & Integration Points

- `src/engine/child-env.ts` — `buildChildEnv` function; signature is fixed by SPEC requirement
- `src/engine/workflow.ts:86` — child subprocess reads `CYCLE_TRUNK_BASED` from its env to activate trunk mode
- `src/cli.ts:139` — sets `process.env.CYCLE_TRUNK_BASED = "1"` when `--trunk` CLI flag is passed
- `.cycle/.env` — may contain `CYCLE_TRUNK_BASED=1`; loaded by `loadDotEnv` before `spawnRunOne` is called

## Test Infrastructure

- **Framework**: Node's built-in `node:test` + `node:assert`
- **Test runner**: `npm test` (runs `pretest` build then the test suite)
- **Coverage**: `npm run test:coverage` → `npm run check:coverage` (LCOV-driven, per-file floors)
- **Typecheck gate**: `npm run typecheck` (`tsc --noEmit`, must exit zero)
- **Relevant test file**: `tests/engine/child-env.test.ts` — covers `buildChildEnv` directly; includes test for CYCLE_TRUNK_BASED stripping and explicit-injection preservation
- **No test file for `spawnRunOne`**: The fix site in `src/cli.ts` is not directly unit-tested; the CLI integration tests in `tests/cli/` test higher-level behaviors
- **Per-file coverage floors**: `src/engine/child-env.ts` is at 100% (enforced); `src/cli.ts` has no explicit floor entry in `scripts/coverage-gate.mjs`
- **SPEC testing strategy**: No new unit tests required; fix is a one-line type correction at a call site

## Code References

- `src/cli.ts:4` — imports `buildChildEnv` from `./engine/child-env.ts`
- `src/cli.ts:139` — sets `process.env.CYCLE_TRUNK_BASED = "1"` from `--trunk` flag
- `src/cli.ts:219` — `function spawnRunOne(params: RunOneParams): Promise<number>` definition
- `src/cli.ts:236` — the problematic ternary producing the union type
- `src/cli.ts:241` — `buildChildEnv(extra)` call — the error location reported by `tsc`
- `src/engine/child-env.ts:16` — `buildChildEnv(extra: Record<string, string>)` signature
- `src/engine/child-env.ts:29-32` — CYCLE_* stripping logic and `extra` spread
- `src/engine/exec-spawn.ts:22` — `buildChildEnv(env ?? {})` — reference pattern for optional-to-concrete normalization
- `src/engine/commit-cycle.ts:20` — `buildChildEnv(envExtra ?? {})` — same normalization pattern
- `src/engine/workflow.ts:86` — consumption of `CYCLE_TRUNK_BASED` in child process
- `tests/engine/child-env.test.ts:57-67` — test confirming explicitly-injected CYCLE_* entries survive the strip

## Open Questions

None. The error message, fix site, signature constraint, and runtime invariant are all fully determined by the existing code. The planner has three equivalent options for the one-line fix:

1. Annotate the variable: `const extra: Record<string, string> = process.env.CYCLE_TRUNK_BASED === "1" ? { CYCLE_TRUNK_BASED: "1" } : {};`
2. Two-statement form: declare `const extra: Record<string, string> = {};` then conditionally assign
3. Object spread: `const extra = { ...(process.env.CYCLE_TRUNK_BASED === "1" ? { CYCLE_TRUNK_BASED: "1" as string } : {}) }`

All three satisfy `Record<string, string>`. Option 1 is the minimal diff.
