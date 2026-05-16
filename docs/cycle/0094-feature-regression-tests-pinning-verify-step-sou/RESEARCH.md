Sufficient data gathered. Writing the research document to stdout.

```markdown
# Research: Cycle 0094

## Cycle Context
Cycle 0094 must deliver two things: (1) the source-mutation guard in `src/defaults/scripts/verify.sh` — a verbatim carry-forward from cycle 0093's PLAN Task 1, which was permission-blocked and shipped zero source changes — and (2) a new `tests/defaults/verify.test.ts` with four integration tests covering the guard's exit-code behavior, plus at least two new static assertions in `tests/defaults/scripts.test.ts`. Together these close the false-positive drain where a permission-blocked agent writes only `docs/cycle/` artifact prose and the engine records `cycle.end status:ok`.

## Current Codebase State

### Relevant Components

- **verify.sh (source)**: 17 lines, no mutation guard — `src/defaults/scripts/verify.sh:1-17`
  - Line 1: `#!/usr/bin/env bash`
  - Line 4: `set -euo pipefail`
  - Line 6: `if [ -f package.json ] && grep -q '"test"' package.json; then` (dispatch block start)
  - No `CYCLE_BASE`, no `git diff`, no `grep -qv` — guard is entirely absent
- **verify.sh (dogfood)**: `.cycle/scripts/verify.sh` — byte-identical to the src copy (confirmed via direct read)
- **CYCLE_BASE injection**: `src/engine/run-cycle.ts:127` — `CYCLE_BASE: process.env.CYCLE_BASE ?? "main"` is set in `cycleEnv` and passed to every bash step as an env var
- **Static script tests**: `tests/defaults/scripts.test.ts:1-19` — 19 lines; tests shebang/executable bits for `verify.sh`, `commit.sh`, `pr.sh` and one body test asserting `npm install` + `node_modules` presence in `verify.sh`
- **Integration test pattern**: `tests/defaults/commit_sh.test.ts:1-120` — full reference implementation; defines inline `makeRepo`, `run`, `runScript`, `commitFilesWithStatus` helpers; uses `mkdtemp`, `spawnSync`, `copyFile` from Node stdlib
- **No verify.test.ts**: `tests/defaults/verify.test.ts` does not exist — confirmed by glob of `tests/defaults/**`

### Existing Patterns to Follow

- **mkdtemp repo setup** (`commit_sh.test.ts:16-36`):
  1. `mkdtemp(join(tmpdir(), "cycle-<name>-"))`
  2. `git init -q`, configure `user.email`, `user.name`, `commit.gpgsign false`
  3. Seed commit with at least one file
  4. `mkdir(".cycle/scripts")`, `copyFile("src/defaults/scripts/<script>.sh", ...)`
  5. `chmod(script, 0o755)`
- **runScript pattern** (`commit_sh.test.ts:38-44`): `spawnSync("bash", [".cycle/scripts/<script>.sh"], { cwd, env: { ...process.env, ...env }, encoding: "utf8" })` — does NOT throw; returns result with `.status`, `.stdout`, `.stderr`
- **Exit-code assertion**: `assert.equal(r.status, 0, \`stderr: ${r.stderr}\`)` — `commit_sh.test.ts:67`
- **try/finally cleanup**: every test wraps body in `try { ... } finally { await rm(root, { recursive: true, force: true }) }` — `commit_sh.test.ts:58-77`
- **Static body assertions** (`scripts.test.ts:15-19`): `const body = await readFile("src/defaults/scripts/verify.sh", "utf8"); assert.match(body, /regex/)` — no subprocess, no tmp repo
- **Helpers are inline, not extracted**: `makeRepo` and `runScript` are defined locally in `commit_sh.test.ts`; no shared helper module exists. SPEC explicitly says to follow this pattern and NOT extract shared helpers (issue `refl-0068` not yet done)
- **Test file imports** (`commit_sh.test.ts:1-6`): `node:test`, `node:assert`, `node:fs/promises` (`mkdtemp`, `mkdir`, `writeFile`, `rm`, `copyFile`, `chmod`), `node:os` (`tmpdir`), `node:path` (`join`), `node:child_process` (`spawnSync`)

### Dependencies & Integration Points

- **`CYCLE_BASE` env var source**: `src/engine/run-cycle.ts:127` — engine always provides this; `:-master` fallback in the script handles standalone/manual invocations on the dogfood repo (which uses `master`, not `main`)
- **sync-defaults**: `scripts/sync-defaults.mjs` syncs `src/defaults/scripts/verify.sh` → `.cycle/scripts/verify.sh`; the two files are currently byte-identical so no divergence guard will trigger; `.cycle/.sync-state.json` is updated after each sync
- **`npm run sync-defaults`**: must be run after editing `src/defaults/scripts/verify.sh` to mirror the change into `.cycle/scripts/verify.sh` (per CLAUDE.md convention)
- **Test runner**: `npm test` auto-runs `pretest` (builds `dist/cycle.js` via esbuild), then Node's native test runner. New `.test.ts` files under `tests/` are automatically discovered — no registration needed.
- **`--experimental-strip-types`**: TypeScript sources run directly; no separate compile step for tests

### Test Infrastructure

- **Framework**: Node native test runner (`node:test` + `node:assert`)
- **Directory**: `tests/defaults/` — all files ending in `.test.ts` are auto-discovered
- **Running**: `npm test` (434+ tests currently passing)
- **Coverage**: `npm run test:coverage` → `scripts/coverage-gate.mjs`; per-file floor for `src/engine/triage.ts ≥ 95%`; this cycle adds no `src/engine/` TS files so coverage gate is unaffected
- **No mocking**: tests use real git processes and bash invocations; `spawnSync` with explicit env vars
- **Current test count**: 434+ (from SPEC and prior cycle observations)
- **Coverage of change area**: `verify.sh` is a bash script — not counted in TS coverage. `scripts.test.ts` static assertions are already in suite. Integration tests for `verify.sh` do not exist yet.

## Code References

- `src/defaults/scripts/verify.sh:1-17` — Current 17-line verify script, no guard, dispatch block starts at line 6
- `.cycle/scripts/verify.sh` — Byte-identical dogfood copy, updated via `npm run sync-defaults`
- `src/engine/run-cycle.ts:124-130` — `cycleEnv` construction: `CYCLE_BASE: process.env.CYCLE_BASE ?? "main"`
- `tests/defaults/scripts.test.ts:1-19` — Static assertions for scripts; `verify.sh` body-pattern test at lines 15-19
- `tests/defaults/commit_sh.test.ts:1-120` — Full reference for integration test pattern: `makeRepo`, `run`, `runScript`, `commitFilesWithStatus`, try/finally cleanup
- `tests/defaults/commit_sh.test.ts:16-36` — `makeRepo()`: mkdtemp → git init/config → seed commit → copy script
- `tests/defaults/commit_sh.test.ts:38-44` — `runScript()`: `spawnSync("bash", [".cycle/scripts/commit.sh"], { cwd, env, encoding })`
- `docs/cycle/0093-feature-add-source-file-mutation-guard-to-verify/PLAN.md:34-86` — Cycle 0093's Task 1: exact guard text to insert, final file shape (23 lines), guard placement (after `set -euo pipefail`, before `if [ -f package.json ]`)
- `docs/cycle/0093-feature-add-source-file-mutation-guard-to-verify/PLAN.md:90-118` — Cycle 0093's Task 2: static assertions for `scripts.test.ts` (6-assertion test block)

## Open Questions

- **CYCLE_BASE value in integration tests**: The integration tests should set `CYCLE_BASE` to the exact SHA of the base commit they create (not a branch name), because the temp repo has no `master`/`main` remote ref. The SPEC says "set `CYCLE_BASE` to the base commit SHA" — the planner should specify exactly how to capture that SHA after the seed commit (e.g., `git rev-parse HEAD` after the base commit, before making test changes).
- **`set -euo pipefail` + `git diff` pipeline with empty diff**: The PLAN.md from 0093 explains that using `if !` condition suppresses `set -e` for the pipeline, making `grep -qv` on empty input safe. The planner should confirm this is carried verbatim and no `|| true` is needed.
- **Integration test copy path**: `commit_sh.test.ts` copies from `src/defaults/scripts/commit.sh` directly (relative path from repo root). `verify.sh` tests should copy from `src/defaults/scripts/verify.sh`. The planner should confirm the test invocation path uses `.cycle/scripts/verify.sh` (not `src/defaults/scripts/verify.sh`) so the test exercises the sync-defaults output path, consistent with `commit_sh.test.ts` pattern.
```
