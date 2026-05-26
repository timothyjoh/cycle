# Research: Cycle 0254

## Cycle Context

Cycle 0254 replaces the silent `npm install` auto-install fallback in `src/defaults/scripts/verify.sh` with fail-fast guards that exit 1 with actionable stderr messages when the environment is not ready. The three new guards cover: Node.js repos with missing `node_modules/`, Python repos without `pytest` on PATH, and repos with no recognized test runner. The trivial pass (`echo "…passing trivially"`) becomes a hard exit 1. After editing the source script, `npm run sync-defaults` must propagate the change to `.cycle/scripts/verify.sh`.

---

## Current Codebase State

### Relevant Components

- **verify.sh (source)**: Shell script that detects project type and runs the appropriate test suite — `src/defaults/scripts/verify.sh:1-17`
- **verify.sh (synced copy)**: Byte-for-byte copy kept in sync by `sync-defaults.mjs` — `.cycle/scripts/verify.sh:1-17`
- **sync-defaults.mjs**: Copies every file under `src/defaults/` to `.cycle/`, with a divergence guard using sha256 state in `.cycle/.sync-state.json` — `scripts/sync-defaults.mjs`
- **sync-state**: Tracks src/dst sha256 pairs to detect local divergence — `.cycle/.sync-state.json`
- **scripts.test.ts**: The only test file that asserts on `verify.sh` source content — `tests/defaults/scripts.test.ts:15-19`

### Current verify.sh Logic

```bash
#!/usr/bin/env bash
# Default verify script. Runs the test suite if a typical project file is present.
# Overridden per-repo when a project has a custom verify.
set -euo pipefail

if [ -f package.json ] && grep -q '"test"' package.json; then
  if [ ! -d node_modules ]; then
    npm install        # ← the target of this cycle
  fi
  npm test
elif [ -f Cargo.toml ]; then
  cargo test
elif [ -f pyproject.toml ]; then
  pytest             # ← no availability guard
else
  echo "verify.sh: no test runner detected; passing trivially"  # ← passes exit 0
fi
```

- `set -euo pipefail` is already present; the script will abort on any unhandled error.
- The script is executable (mode `0755`).
- Shebang is `#!/usr/bin/env bash` (required by `scripts.test.ts` assertion at line 9).

### How verify.sh Is Invoked

`verify.sh` is referenced as a bash step in `src/defaults/workflows.yml` at multiple steps:

- Line 26: `{ name: verify, agent: bash, command: scripts/verify.sh }` (feature workflow)
- Line 29: `{ name: final_verify, agent: bash, command: scripts/verify.sh }` (feature workflow)
- Lines 39, 48, 59: similar patterns in other workflow definitions

`exec-bash.ts` resolves the command path as `join(repoRoot, ".cycle", command)` — meaning the engine always runs `.cycle/scripts/verify.sh`, not `src/defaults/scripts/verify.sh` directly — `src/engine/exec-bash.ts:14`.

`execBashStep` spawns `/bin/bash [absPath]` with `shell: false`, passes `buildChildEnv(env)` as the subprocess environment, and resolves status from exit code — `src/engine/exec-bash.ts:15-32`.

### Test Infrastructure

- **Test framework**: Node built-in `node:test` with `--experimental-strip-types` (no transpile step).
- **Test runner**: `npm test` → `node --test --experimental-strip-types --test-reporter=spec`
- **Coverage**: `npm run test:coverage` → LCOV output to `.cycle/coverage.lcov`; coverage gate enforced by `scripts/coverage-gate.mjs`
- **Structural invariants**: `scripts/structural-invariants.mjs` — currently has no entries targeting `verify.sh`
- **Test file layout**: `tests/defaults/scripts.test.ts` — this is the only test file that reads `verify.sh` source content

### Existing Test Assertions That Must Change

`tests/defaults/scripts.test.ts:15-19` contains a test that will break after this cycle's change:

```typescript
test("verify.sh installs deps when node_modules is missing", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.match(body, /npm install/, "verify.sh should invoke npm install");
  assert.match(body, /node_modules/, "verify.sh should reference node_modules");
});
```

This test name, assertion content, and both regex patterns (`/npm install/`, `/node_modules/`) directly contradict the new behavior and must be replaced.

### Other Tests That Reference verify.sh

These tests **write their own stub `verify.sh`** into a temp directory — they do not read `src/defaults/scripts/verify.sh`. They are unaffected by content changes:

- `tests/cli/run-one.test.ts:46-48` — writes `#!/bin/bash\nexit ${scriptExitCode}\n`
- `tests/engine/run-cycle.test.ts:488-490` — writes `#!/bin/bash\necho verify\n`
- `tests/engine/run-cycle.test.ts:1074` — similar stub pattern
- `tests/cli/resume.test.ts:51` — references `scripts/verify.sh` in workflow YAML only
- `tests/cli/halt.test.ts`, `tests/cli/engine-lock-integration.test.ts` — reference via workflow YAML only
- `tests/cli/init.test.ts:25` — only asserts the file exists via `stat`

### Sync-Defaults Mechanics

`scripts/sync-defaults.mjs` uses sha256 comparison:
1. Reads `src/defaults/` recursively.
2. For each file, computes src sha256 and dst sha256.
3. If dst exists, dst sha differs from src sha, and the recorded `dst_sha256` in `.sync-state.json` also differs from current dst — the file is "locally divergent" and skipped (exit 2) unless `--force` is passed.
4. On a clean in-sync state (src == dst), it is a no-op.

The current `.cycle/.sync-state.json` records matching sha256 for `.cycle/scripts/verify.sh` (both `src_sha256` and `dst_sha256` are `6649522d9dc762f0ca87c29e9fb891c4c54c0856c7ff28e2703cfdb6cc1b7a83`), meaning `src/defaults/scripts/verify.sh` and `.cycle/scripts/verify.sh` are currently identical. After editing `src/defaults/scripts/verify.sh`, the src sha will differ from the recorded dst sha — `sync-defaults` will treat `.cycle/scripts/verify.sh` as "locally divergent" and skip it unless forced. **`--force` or `CYCLE_SYNC_DEFAULTS_FORCE=1` is required to propagate the change.**

### path-utils Denylist

`src/engine/path-utils.ts:1` — `node_modules` is in the `DENYLIST_PREFIXES` array, so `isDenied("node_modules")` returns true. Files under `node_modules/` are already excluded from the `touched.json` footprint when computing changed paths in `run-cycle.ts:89`. `package-lock.json` is not in the denylist and is not excluded from touched tracking.

---

## Code References

- `src/defaults/scripts/verify.sh:1-17` — Current script: shebang, `set -euo pipefail`, Node/Rust/Python/fallback branches
- `.cycle/scripts/verify.sh:1-17` — Synced copy (currently identical)
- `scripts/sync-defaults.mjs:1-110` — Sync mechanism; divergence guard; `--force` flag
- `.cycle/.sync-state.json` — Current sha256 state for all synced files
- `tests/defaults/scripts.test.ts:1-19` — Two tests: (1) shebang+executable check, (2) `npm install` assertion that must be replaced
- `tests/defaults/sync-defaults-guard.test.ts` — Full test coverage of sync-defaults behavior; unaffected by this cycle
- `src/engine/exec-bash.ts:14` — Path resolution: `join(repoRoot, ".cycle", command)`
- `src/engine/path-utils.ts:1` — `node_modules` in denylist prefix
- `src/defaults/workflows.yml:26,29,39,48,59` — `scripts/verify.sh` referenced as bash steps
- `scripts/structural-invariants.mjs:12-36` — INVARIANTS table; no verify.sh entries

---

## Open Questions

- The SPEC notes that `npm run sync-defaults` will be affected by the divergence guard since `.cycle/scripts/verify.sh` currently matches `src/defaults/scripts/verify.sh` by sha. After editing `src/defaults/scripts/verify.sh`, the guard will fire and skip `.cycle/scripts/verify.sh` on a plain `sync-defaults` run. The planner must determine whether to run `sync-defaults --force` or `CYCLE_SYNC_DEFAULTS_FORCE=1 npm run sync-defaults` to propagate the change.
- The SPEC's testing strategy calls for a minimal manual smoke test (tmpdir runs). The planner should confirm whether this is documented in BUILD.md only, or whether any automated shell-script test harness exists or should be created.
