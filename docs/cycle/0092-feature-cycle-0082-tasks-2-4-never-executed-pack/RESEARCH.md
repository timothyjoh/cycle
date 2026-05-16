I have all the information needed. Writing the research document to stdout now.

```markdown
# Research: Cycle 0092

## Cycle Context

Cycle 0082 implemented only Task 1 of its plan (and even that landed with wrong content — see cycle 0091). Tasks 2–4 were never executed: `package.json` has no `check:tsconfig-floor` script, `pretest:coverage` does not invoke it, there is no test suite, and RFC-002's deferrable-concern sentence is unannotated. This cycle wires the now-correct `scripts/check-tsconfig-floor.mjs` into npm lifecycle hooks, adds a four-case test suite, and annotates RFC-002. **Critical pre-condition**: cycle 0091's commit (`9525adc`) added artifact files (PLAN_FIX.md, QUICK_FIX.md, TEST_FIX.md) to `docs/cycle/0091-…/` but did NOT modify `scripts/check-tsconfig-floor.mjs`. That file still contains coverage-gate logic. The build step for cycle 0092 must also overwrite `scripts/check-tsconfig-floor.mjs` with the correct tsconfig-validator body from 0091's `PLAN_FIX.md` before proceeding to the other tasks.

---

## Current Codebase State

### Relevant Components

- **`scripts/check-tsconfig-floor.mjs`** (lines 1–68): Contains coverage-gate logic — reads `.cycle/coverage.lcov`, enforces a `FLOORS` table for `src/engine/triage.ts`. This is **wrong content**; the file should validate `tsconfig.json` compilerOptions. The correct replacement body is documented verbatim in `docs/cycle/0091-quickfix-fix-check-tsconfig-floor-mjs-replace-cov/PLAN_FIX.md:19-64`.

- **`scripts/coverage-gate.mjs`** (lines 1–68): The legitimate coverage-gate script. It is what `check-tsconfig-floor.mjs` currently copies. Referenced by `npm run check:coverage` and `posttest:coverage`. **Must not be touched.**

- **`package.json`** (lines 22–34, `scripts` block): Current state:
  - `pretest:coverage` (line 26): `"node scripts/build.mjs && node -e \"require('fs').mkdirSync('.cycle',{recursive:true})\""` — no `check:tsconfig-floor` invocation
  - `posttest:coverage` (line 28): `"node scripts/coverage-gate.mjs"`
  - `check:coverage` (line 29): `"node scripts/coverage-gate.mjs"`
  - **No** `check:tsconfig-floor` entry in `scripts`

- **`docs/RFC-002-typescript-es2023-floor.md`** (line 19): `- A CI check that pins the lib floor is a separate, deferrable concern (a regression would already trip \`npm run typecheck\` because of the existing \`findLast\` callers at \`tests/cli/multi-loop.test.ts:53,114\`).` — **unannotated**; no reference to `check:tsconfig-floor`.

- **`tsconfig.json`** (lines 3–4): `"target": "ES2023"`, `"lib": ["ES2023"]` — passes the floor check; `check:tsconfig-floor` should exit 0 on this repo's current config.

- **`tests/scripts/`**: **Does not exist**. No `tests/scripts/` directory. Must be created with the new test file.

---

### Existing Patterns to Follow

- **Script test pattern**: `tests/defaults/sync-defaults-guard.test.ts:8,24` defines the canonical pattern for testing `.mjs` scripts via subprocess:
  ```ts
  const SCRIPT = join(process.cwd(), "scripts/sync-defaults.mjs");
  // …
  return spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8" as const });
  ```
  Key: `process.execPath` (not hardcoded `"node"`), absolute `SCRIPT` path via `join(process.cwd(), "scripts/…")`, `encoding: "utf8"` to get string stdout/stderr.

- **Temp-dir cleanup**: All test files in `tests/engine/exec-bash.test.ts:9,21` and `tests/defaults/sync-defaults-guard.test.ts:30` use `mkdtemp(join(tmpdir(), "cycle-…-"))` with a try/finally `rm(root, { recursive: true, force: true })`. No `after` hooks used; inline cleanup is the project convention.

- **Import style**: All test files use `import { test } from "node:test"` + `import { strict as assert } from "node:assert"` + `import { … } from "node:fs/promises"` + `import { … } from "node:child_process"`. No default imports, no third-party test libraries.

- **`pretest:coverage` prepend pattern**: Current `pretest:coverage` chains with `&&`. The new `check:tsconfig-floor` invocation prepends as `npm run check:tsconfig-floor && node scripts/build.mjs && …`.

- **npm script naming**: `check:coverage` (line 29) establishes the `check:` namespace convention. New script follows: `"check:tsconfig-floor": "node scripts/check-tsconfig-floor.mjs"`.

---

### Dependencies & Integration Points

- **`scripts/check-tsconfig-floor.mjs`** must be overwritten before wiring into `package.json` — the current content will always exit 2 (missing LCOV) when invoked via `pretest:coverage`, breaking `npm run test:coverage` for all tests. — `scripts/check-tsconfig-floor.mjs`

- **`posttest:coverage`** already calls `scripts/coverage-gate.mjs` (line 28). The new `check:tsconfig-floor` runs in `pretest:coverage` (before build), not `posttest:coverage`. The two scripts are independent. — `package.json:26,28`

- **`tsconfig.json`** is read by `check-tsconfig-floor.mjs` from `process.cwd()` (the repo root when run via `npm run`). Subprocess tests must write a synthetic `tsconfig.json` into the temp dir and set `cwd` to that temp dir. — `tsconfig.json:3-4`

- **`CLAUDE.md` Commands table** (lines 20–34): Needs a new row for `check:tsconfig-floor`. — `CLAUDE.md:20-34`

---

### Test Infrastructure

- **Framework**: Node native test runner — `node:test` + `node:assert`. No vitest, jest, or mocha. All test files in `tests/**/*.test.ts` use this.
- **Runner invocation**: `node --test --experimental-strip-types --test-reporter=spec` (no `tsc` pre-pass). TypeScript sources run directly.
- **Test directory layout**: Flat subdirectories by domain: `tests/engine/`, `tests/cli/`, `tests/defaults/`, `tests/issue/`. New `tests/scripts/` is a new top-level subdirectory (no existing precedent, but consistent with the pattern).
- **Script subprocess testing**: `tests/defaults/sync-defaults-guard.test.ts` is the reference implementation — same pattern the new `tests/scripts/check-tsconfig-floor.test.ts` should follow.
- **Coverage exclusions**: `tests/**` is excluded from coverage reporting (`--test-coverage-exclude='tests/**'` in `package.json:27`). New test file under `tests/scripts/` is automatically excluded; no config change needed.
- **Current coverage baseline** (from CLAUDE.md): line ≥ 95%, branch ≥ 75%, function ≥ 90%. `scripts/` is also excluded from coverage reporting, so the new `.mjs` script does not affect coverage numbers.

---

## Code References

- `scripts/check-tsconfig-floor.mjs:1-68` — Wrong content (coverage-gate). Must be replaced.
- `docs/cycle/0091-quickfix-fix-check-tsconfig-floor-mjs-replace-cov/PLAN_FIX.md:19-64` — Verbatim correct replacement body for `check-tsconfig-floor.mjs`.
- `package.json:26` — `pretest:coverage` line; needs `npm run check:tsconfig-floor && ` prepended.
- `package.json:29` — `check:coverage` entry; `check:tsconfig-floor` is added adjacently as a new entry.
- `docs/RFC-002-typescript-es2023-floor.md:19` — Deferrable-concern sentence; needs annotation referencing `npm run check:tsconfig-floor` and marking concern resolved.
- `CLAUDE.md:20-34` — Commands table; needs new `check:tsconfig-floor` row.
- `tests/defaults/sync-defaults-guard.test.ts:8,18-24` — Reference pattern for `spawnSync`-based script tests.
- `tests/engine/exec-bash.test.ts:9-21` — Reference pattern for `mkdtemp` + try/finally cleanup.
- `tsconfig.json:3-4` — Current `target`/`lib` values (`"ES2023"`); `npm run check:tsconfig-floor` must exit 0 against this file.

---

## Open Questions

1. **`scripts/check-tsconfig-floor.mjs` prerequisite**: Cycle 0091's commit did not update this file. The build step must apply the fix from `PLAN_FIX.md:19-64` as part of this cycle before wiring into `package.json`. The planner should decide whether to treat this as Task 0 (pre-existing fix to apply) or surface it as a blocker requiring manual intervention.

2. **CLAUDE.md `check:tsconfig-floor` row placement**: SPEC mentions adding it to the Commands table, but RFC-002 annotation is the direct spec requirement. Confirm whether CLAUDE.md edit is in-scope for this cycle or post-cycle cleanup (SPEC lists it under `## Documentation Updates`; SPEC requirements list does not include it as a named acceptance criterion).

3. **`spawnSync` exit code for tsconfig missing**: The spec says case 4 (missing `tsconfig.json`) exits 1, but the correct `check-tsconfig-floor.mjs` implementation (PLAN_FIX.md) uses `process.exit(2)` for unreadable file. The test should assert exit code 2 (not 1) for the missing-file case, or the spec's stated exit code 1 must be reconciled against the implementation in PLAN_FIX.md.
```
