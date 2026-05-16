I have everything needed. Writing the RESEARCH.md now.

```markdown
# Research: Cycle 0082

## Cycle Context

Cycle 0082 delivers the `scripts/check-tsconfig-floor.mjs` guard that asserts `tsconfig.json` `compilerOptions.target` and `lib` are both at the ES2023 floor, wires it into `pretest:coverage`, adds a four-case test suite in `tests/scripts/check-tsconfig-floor.test.ts`, and annotates RFC-002 line 19 as resolved. Cycle 0079 was the original assignee but exited with a placeholder BUILD.md — full SPEC.md and PLAN.md survived and are referenced here.

---

## Current Codebase State

### Relevant Components

- **`tsconfig.json`** (repo root, lines 1–17): `compilerOptions.target === "ES2023"`, `compilerOptions.lib === ["ES2023"]`. These are the exact fields the guard must assert. No other `target`/`lib` entries exist.
- **`package.json` scripts block** (lines 22–34):
  - `pretest:coverage` (line 26): `"node scripts/build.mjs && node -e \"require('fs').mkdirSync('.cycle',{recursive:true})\""` — this is the target `&&`-chain that gets the `check:tsconfig-floor` prepend.
  - `check:coverage` (line 29): `"node scripts/coverage-gate.mjs"` — structural neighbor for the new `check:tsconfig-floor` entry.
  - No `check:tsconfig-floor` script exists yet.
- **`scripts/coverage-gate.mjs`** (lines 1–67): Structural analog for the new script. Pure `.mjs`, uses `node:fs/promises`, `console.error` for failures, `process.exit` with exit codes 0/1/2, no external deps. Top-level `await` at module level.
- **`docs/RFC-002-typescript-es2023-floor.md`** (line 19): `"- A CI check that pins the lib floor is a separate, deferrable concern (a regression would already trip \`npm run typecheck\` because of the existing \`findLast\` callers at \`tests/cli/multi-loop.test.ts:53,114\`)."` — this exact sentence is the annotation target.
- **`scripts/` directory**: Contains `build.mjs`, `coverage-gate.mjs`, `gen-cycle-reports.mjs`, `sync-defaults.mjs`. All are pure `.mjs` with no external dependencies.
- **`tests/scripts/`**: Does not exist. The new test file creates it implicitly.

### Existing Patterns to Follow

- **Script structure pattern** (`scripts/coverage-gate.mjs:1–67`): `#!/usr/bin/env node` shebang, JSDoc comment block, `import` from `node:fs/promises`, top-level `await readFile(...)`, `console.error(...)` to name the offending value, `process.exit(0/1/2)`. No classes or helper functions — flat sequential logic.
- **Test pattern** (`tests/defaults/sync-defaults-guard.test.ts:1–194`): `import { test } from "node:test"` + `import { strict as assert } from "node:assert"`, `spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" })`, `mkdtemp`/`rm` temp-dir lifecycle in `try/finally`, flat top-level `test()` calls. The `SCRIPT` const is `join(process.cwd(), "scripts/<name>.mjs")`. No shared fixtures — each test is self-contained.
- **`spawnSync` usage** (`tests/defaults/sync-defaults-guard.test.ts:24`): `spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8" as const })` — `process.execPath` ensures the same Node binary, `encoding: "utf8" as const` is required for TypeScript type narrowing.
- **Exit code assertions** (`sync-defaults-guard.test.ts:38`): `assert.equal(result.status, 0, \`stderr: ${result.stderr}\`)` — `result.status` holds the process exit code; stderr is embedded in the failure message for diagnostics.
- **`pretest:coverage` chain** (`package.json:26`): Existing pattern uses `&&` to chain guards before build. The guard fails fast, aborting the chain before the slower build.

### Dependencies & Integration Points

- **`tsconfig.json` include field** (line 17): `"include": ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.mjs"]` — the new `tests/scripts/check-tsconfig-floor.test.ts` falls under `tests/**/*.ts`, already covered. No tsconfig change needed.
- **`npm test` glob**: `node --test --experimental-strip-types` with no explicit path filter discovers `**/*.test.{ts,js,mjs}` automatically — `tests/scripts/check-tsconfig-floor.test.ts` is picked up without changes to the test command.
- **Coverage exclusion** (`package.json:27`): `--test-coverage-exclude='scripts/**'` excludes the guard script itself from coverage metrics. The new test file is under `tests/**` (already excluded). Neither file affects coverage numbers.
- **`posttest:coverage` → `scripts/coverage-gate.mjs`** (`package.json:28`): Runs after tests; not relevant to the new script's wiring.
- **Node version floor** (`package.json:36`): `>=22.6` — top-level `await` in `.mjs` is safe.

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`, `node:assert`). No third-party test libraries.
- **Conventions**: Flat `test()` calls at module top level; async test functions; `try/finally` cleanup; no `describe` blocks; `assert.equal(result.status, <N>, ...)` for exit codes; `assert.match(result.stderr, /<pattern>/)` for stderr content.
- **Test runner invocation**: `node --test --experimental-strip-types --test-reporter=spec` (no explicit path — discovers all `*.test.ts`).
- **Current test count**: 54 test files (from glob). `tests/scripts/` is new territory.
- **Coverage of change area**: `scripts/check-tsconfig-floor.mjs` is excluded from coverage tracking via `--test-coverage-exclude='scripts/**'`. The test file itself is in `tests/**` (also excluded). Net coverage impact: zero.

---

## Code References

- `tsconfig.json:3` — `"target": "ES2023"` (the guarded field)
- `tsconfig.json:4` — `"lib": ["ES2023"]` (the guarded field)
- `package.json:26` — `pretest:coverage` script (prepend target)
- `package.json:29` — `check:coverage` entry (insertion neighbor for new `check:tsconfig-floor`)
- `scripts/coverage-gate.mjs:1–67` — structural analog for the new script
- `scripts/coverage-gate.mjs:12–13` — `FLOORS` const; shows the "name the offending field" convention in error messages
- `tests/defaults/sync-defaults-guard.test.ts:8` — `SCRIPT` const pattern
- `tests/defaults/sync-defaults-guard.test.ts:18–24` — `runScript()` helper pattern using `spawnSync`
- `tests/defaults/sync-defaults-guard.test.ts:29–57` — happy-path test with `mkdtemp`/`rm` lifecycle
- `docs/RFC-002-typescript-es2023-floor.md:19` — exact sentence to annotate as resolved
- `docs/cycle/0079-feature-add-ci-guard-pinning-tsconfig-json-targe/PLAN.md:44–93` — full script body (verbatim) including the `opts = cfg?.compilerOptions ?? {}` fallback
- `docs/cycle/0079-feature-add-ci-guard-pinning-tsconfig-json-targe/PLAN.md:133–213` — full test file body (verbatim) including all 4 test cases

---

## Open Questions

1. **SPEC case 4 vs PLAN test 4 mismatch**: SPEC defines case 4 as "missing `compilerOptions` key → exit 1, stderr includes both `target` and `lib`". PLAN defines test 4 as "lib is a string not an array → exit 1, stderr includes `lib`". These are different test vectors. The planner must decide which to implement (or both as 4+5 cases). The SPEC is authoritative; PLAN was written before SPEC 0082 was finalized with the `missing compilerOptions` criterion.

2. **Missing `compilerOptions` behavior confirmation**: The PLAN script uses `cfg?.compilerOptions ?? {}`, which means absent `compilerOptions` causes both `target` and `lib` checks to fail (both undefined). This produces exit 1 with two error lines — one naming `target`, one naming `lib`. SPEC requires "stderr includes both `target` and `lib`", which this satisfies. The test assertion needs to verify both patterns appear in stderr.

3. **RFC-002 annotation phrasing**: PLAN proposes strikethrough + "resolved in cycle 0079 via `scripts/check-tsconfig-floor.mjs`". Since the actual work ships in cycle 0082, the annotation should reference cycle 0082 (or remain as PLAN wrote — this is editorial).
```
