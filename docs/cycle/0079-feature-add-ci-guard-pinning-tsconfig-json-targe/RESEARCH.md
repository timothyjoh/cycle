Enough context. Writing the research document now.

```markdown
# Research: Cycle 0079

## Cycle Context
Cycle 0079 adds a small, dependency-free Node script (`scripts/check-tsconfig-floor.mjs`) that asserts `tsconfig.json` `compilerOptions.target === "ES2023"` and `compilerOptions.lib` includes `"ES2023"`, wires it as `check:tsconfig-floor` in `package.json` and invokes it from `pretest:coverage`, adds a regression test under `tests/scripts/check-tsconfig-floor.test.ts`, and annotates RFC-002 line 19 as resolved.

## Current Codebase State

### Relevant Components

- **`tsconfig.json`** — `compilerOptions.target: "ES2023"`, `compilerOptions.lib: ["ES2023"]`. This is the file the new guard reads. — `tsconfig.json:1-17`
- **`package.json` scripts** — Current `pretest:coverage` value: `"node scripts/build.mjs && node -e \"require('fs').mkdirSync('.cycle',{recursive:true})\""`. New check must be appended here. `check:coverage` key (`"node scripts/coverage-gate.mjs"`) is the naming analogue for the new `check:tsconfig-floor` key. — `package.json:22-34`
- **`scripts/coverage-gate.mjs`** — Closest structural analog to the new script: pure Node `.mjs`, no external deps, reads a file, validates against a table, `console.error()`s descriptive messages naming the offending value, `process.exit(1)` on failure, `process.exit(2)` on missing file, `process.exit(0)` on pass. Uses `node:fs/promises` and named import style. — `scripts/coverage-gate.mjs:1-67`
- **`docs/RFC-002-typescript-es2023-floor.md`** — Line 19 is the exact sentence to annotate: `"A CI check that pins the lib floor is a separate, deferrable concern (a regression would already trip \`npm run typecheck\`…)"`. — `docs/RFC-002-typescript-es2023-floor.md:19`

### Existing Patterns to Follow

- **Script style (`scripts/*.mjs`)**: Top-of-file comment block explaining purpose + contract. Named imports from `node:*` built-ins only. Top-level `await` is fine (all scripts use it). `process.argv`-based config. Errors to `console.error`, status to `console.log`. Exit codes: `0` = pass, `1` = validation failure, `2` = missing/unreadable input. — `scripts/coverage-gate.mjs:1-67`, `scripts/sync-defaults.mjs:1-50`
- **Subprocess test pattern**: `tests/defaults/sync-defaults-guard.test.ts` is the canonical model — uses `spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" })`, `mkdtemp`/`rm` for isolation, asserts `result.status` and matches `result.stderr`. `SCRIPT` is resolved with `join(process.cwd(), "scripts/...")` at module top. — `tests/defaults/sync-defaults-guard.test.ts:8,18-24`
- **Test framework**: `import { test } from "node:test"` + `import { strict as assert } from "node:assert"`. No describe blocks — flat `test()` calls. — `tests/defaults/sync-defaults-guard.test.ts:1-2`
- **Temp dir lifecycle**: `mkdtemp(join(tmpdir(), "prefix-"))` → seed files → run → assertions → `rm(root, { recursive: true, force: true })` in `finally`. — `tests/defaults/sync-defaults-guard.test.ts:29-57`
- **`pretest:coverage` extension**: Currently a `&&`-chained shell one-liner. Additional commands append as `&& node scripts/<name>.mjs`. — `package.json:26`

### Dependencies & Integration Points

- **`pretest:coverage` → new script**: The new `check:tsconfig-floor` must run before tests. The `pretest:coverage` hook is a `&&` chain; append `&& node scripts/check-tsconfig-floor.mjs`. — `package.json:26`
- **`posttest:coverage` → `coverage-gate.mjs`**: Runs after tests. The new script is pre-test, not post-test. No change to this chain. — `package.json:28`
- **Script reads `tsconfig.json` relative to `process.cwd()`**: npm scripts run with `cwd` = repo root, so `readFileSync("tsconfig.json")` works without path resolution. Tests override `cwd` by passing a temp dir to `spawnSync`. — `tsconfig.json:1`
- **`tsconfig.json` `include` array**: Currently `["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.mjs"]`. The new `.mjs` script lives under `scripts/` and is already included; no `tsconfig.json` change needed for the script itself. Test file `tests/scripts/check-tsconfig-floor.test.ts` is covered by `tests/**/*.ts`. — `tsconfig.json:16`

### Test Infrastructure

- **Framework**: Node's native test runner (`node --test --experimental-strip-types`). No Jest, no Mocha.
- **Test directory layout**: `tests/` with subdirs by domain: `tests/engine/`, `tests/cli/`, `tests/defaults/`, `tests/issue/`. The SPEC targets `tests/scripts/` — this directory does not yet exist and must be created.
- **Subprocess invocation**: `spawnSync(process.execPath, [scriptPath], { cwd, encoding: "utf8" })`. `process.execPath` ensures the same Node binary; `cwd` controls which `tsconfig.json` the script finds. — `tests/defaults/sync-defaults-guard.test.ts:24`
- **No mocking**: Script tests spawn real subprocesses; no test doubles.
- **Coverage of change area**: `scripts/` is excluded from coverage reporting (`--test-coverage-exclude='scripts/**'` in `test:coverage`). The new script will not appear in coverage metrics; only the test file itself needs to pass. — `package.json:27`

## Code References

- `package.json:26` — `pretest:coverage` current value: build + mkdirSync; new check appends here
- `package.json:29` — `check:coverage` key: naming template for `check:tsconfig-floor`
- `scripts/coverage-gate.mjs:1-16` — Script file header + imports + constant table pattern to follow
- `scripts/coverage-gate.mjs:17-26` — File read with `ENOENT` → `process.exit(2)` pattern
- `scripts/coverage-gate.mjs:49-65` — Validation loop: `console.error` names offending field + value, increments failure counter, single `process.exit` at end
- `tests/defaults/sync-defaults-guard.test.ts:8` — `SCRIPT` constant: `join(process.cwd(), "scripts/sync-defaults.mjs")`
- `tests/defaults/sync-defaults-guard.test.ts:18-24` — `runScript` helper: `spawnSync(process.execPath, args, { cwd, encoding: "utf8" })`
- `tests/defaults/sync-defaults-guard.test.ts:29-57` — Full happy-path test with temp dir, seeded files, assertions, `finally` cleanup
- `docs/RFC-002-typescript-es2023-floor.md:19` — Exact line to annotate as resolved in cycle 0079
- `tsconfig.json:3-4` — `target: "ES2023"`, `lib: ["ES2023"]` — the values the guard asserts

## Open Questions

- None. The SPEC and codebase are fully consistent; no ambiguities remain for the planner.
```
