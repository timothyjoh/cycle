Enough data. Writing RESEARCH.md now.

```markdown
# Research: Cycle 0140

## Cycle Context
SPEC asks for a new `scripts/structural-invariants.mjs` script that regex-checks source files for "exactly one of X" invariants, seeded with the `triage.ts` `childIds` single-Set rule. The script gets a new `check:invariants` npm script and is wired into `posttest:coverage` alongside the existing `check:coverage` call. A regression test in `tests/scripts/structural-invariants.test.ts` exercises it against two fixture files (clean and violation) in `tests/fixtures/structural-invariants/`. A `## Structural-invariants policy` section is added to `CLAUDE.md`.

## Current Codebase State

### Relevant Components

- **`scripts/coverage-gate.mjs`** — pattern reference for the new script. Shape: shebang `#!/usr/bin/env node`, multi-line comment header, named in-file `FLOORS` table, `process.argv[2]` fallback for input path, `try/catch` file read → `process.exit(2)`, `failed` counter accumulating errors, `console.error` for failures, `console.log` for successes, `process.exit(failed > 0 ? 1 : 0)`. — `scripts/coverage-gate.mjs:1-73`

- **`src/engine/triage.ts:438`** — sole occurrence of `const childIds = new Set<string>()`. This is the invariant the new script must enforce (exactly one such declaration). Lines 501, 507, 542, 550 reference `childIds` but do not declare a new Set — only line 438 is a `const childIds = new Set` declaration.

- **`package.json:28`** — `"posttest:coverage": "node scripts/coverage-gate.mjs"` — must be extended to also call `node scripts/structural-invariants.mjs` (fan-out, both must pass).

- **`package.json:29`** — `"check:coverage": "node scripts/coverage-gate.mjs"` — model for the new `check:invariants` entry that points at the new script.

- **`tests/scripts/coverage-gate.test.ts`** — 5-test suite for `coverage-gate.mjs`. Pattern: `spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" })`, `mkdtemp` + `rm` in finally, asserts on `result.status`, `result.stderr`, `result.stdout`. No mocking. — `tests/scripts/coverage-gate.test.ts:1-133`

- **`tests/scripts/sync-defaults.test.ts`** — second script test, same pattern: `spawnSync` with `cwd` override, `seed()` helper to write fixture files, tmpdir + finally cleanup. — `tests/scripts/sync-defaults.test.ts:1-50+`

- **`tests/fixtures/`** — does not exist yet. Must be created at `tests/fixtures/structural-invariants/` with two `.ts` fixture files.

### Existing Patterns to Follow

- **Script shebang + comment header**: `#!/usr/bin/env node` on line 1, followed by a `//` block describing purpose, exit codes, and extension instructions. — `scripts/coverage-gate.mjs:1-8`

- **In-file named table as single source of truth**: `const FLOORS = { ... }` object literal keyed by file path. New script uses `const INVARIANTS = [...]` (array, since entries have multiple fields: file, pattern, expected, reason). — `scripts/coverage-gate.mjs:12-20`

- **Exit codes**: 0 = all pass, 1 = gate failure, 2 = input/config error (missing file or missing block). SPEC requires same semantics: exit 1 on mismatch, 0 on clean.

- **Test file naming and location**: `tests/scripts/<script-name>.test.ts`. — `tests/scripts/coverage-gate.test.ts`, `tests/scripts/sync-defaults.test.ts`

- **Test imports**: `import { test } from "node:test"`, `import { strict as assert } from "node:assert"`, `import { spawnSync } from "node:child_process"`. No third-party test framework. — `tests/scripts/coverage-gate.test.ts:1-6`

- **Script path constant**: `const SCRIPT = join(process.cwd(), "scripts/<name>.mjs")` — path resolved relative to `process.cwd()` (repo root at test time). — `tests/scripts/coverage-gate.test.ts:8`

- **spawnSync invocation**: `spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" as const })` — passes `process.execPath` (same Node binary), no shell. For the invariants script, the fixture path must be passed as an argument or the script must accept a path override via argv (or an env var). SPEC says "fixture path substituted" — argv injection is likely needed.

- **Fixture files via tmpdir**: `mkdtemp` + seed fixture content + `rm` in `finally`. — `tests/scripts/coverage-gate.test.ts:39-54`

- **`--experimental-strip-types`**: test files are `.ts` run directly with `node --experimental-strip-types` — no compile step. — `package.json:25`

### Dependencies & Integration Points

- **`package.json` `posttest:coverage`** — currently `"node scripts/coverage-gate.mjs"`. Must become `"node scripts/coverage-gate.mjs && node scripts/structural-invariants.mjs"` (or similar fan-out). Both scripts must be independently callable via `check:coverage` / `check:invariants`. — `package.json:28-29`

- **`src/engine/triage.ts`** — the only real target file in the initial INVARIANTS table. The script reads this file's source text, counts regex matches, compares to expected=1. The file must not be modified by this cycle. — `src/engine/triage.ts:438`

- **`scripts/coverage-gate.mjs`** — no code dependency on the new script; they are siblings in `scripts/`. Both called by `posttest:coverage`.

- **`CLAUDE.md` Coverage policy section** — new `## Structural-invariants policy` section must be placed near it. Current coverage policy is in `CLAUDE.md` under `## Coverage policy`.

### Test Infrastructure

- **Framework**: Node built-in `node:test` runner, invoked via `node --test --experimental-strip-types`. No Jest, no Vitest.
- **Test file layout**: `tests/scripts/` for script-level tests, `tests/defaults/` for workflow defaults tests, `tests/` root and subdirs for engine unit tests.
- **Fixture approach for scripts tests**: tmpdir created per test, files seeded programmatically via `writeFile`, always cleaned up in `finally`. The invariants test will differ slightly — fixture `.ts` files can be checked into `tests/fixtures/structural-invariants/` (static, not tmpdir) since they are stable source text, not generated data.
- **Subprocess pattern**: `spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" })` — args array lets the test pass a fixture file path as argv override.
- **Current test count**: 479 tests passing (from prior cycle).
- **Coverage of the change area**: `scripts/structural-invariants.mjs` does not exist yet, so no current coverage. `src/engine/triage.ts` is gated at 95% floor.

## Code References

- `scripts/coverage-gate.mjs:1-8` — Shebang + comment header pattern
- `scripts/coverage-gate.mjs:12-20` — `FLOORS` table (in-file table pattern for new `INVARIANTS`)
- `scripts/coverage-gate.mjs:22-32` — `process.argv[2]` input path with try/catch → exit 2
- `scripts/coverage-gate.mjs:55-73` — failed-counter loop, stderr/stdout output, exit
- `src/engine/triage.ts:438` — `const childIds = new Set<string>()` — the single declaration the invariant enforces
- `package.json:28` — `posttest:coverage` hook (needs fan-out extension)
- `package.json:29` — `check:coverage` script (model for `check:invariants`)
- `tests/scripts/coverage-gate.test.ts:1-133` — Full pattern reference for script subprocess tests
- `tests/scripts/sync-defaults.test.ts:1-50` — Second pattern reference with `seed()` helper and env var deletion

## Open Questions

- **argv override mechanism**: The script needs to accept a per-file path override so the regression test can substitute a fixture file instead of the real `src/engine/triage.ts`. `process.argv[2]` is taken by `coverage-gate.mjs` for the LCOV path. For `structural-invariants.mjs`, one option is a `--root` flag (run against a different root dir), another is accepting the target file path directly via a positional arg map. The SPEC says "fixture path substituted" but does not prescribe the argv shape — planner must decide.
- **Structured stderr format**: SPEC requires stderr lines include `file`, `pattern`, `actual`, `expected`, `reason`. Whether these are space-separated tokens or a JSON object is unspecified — planner should decide based on parseability for the regression test assertion.
- **`check:invariants` default file resolution**: When called without args (normal CI), the script must locate `src/engine/triage.ts` relative to `process.cwd()` (repo root). Planner must confirm the path resolution strategy matches the tmpdir `cwd` override used in tests.
```
