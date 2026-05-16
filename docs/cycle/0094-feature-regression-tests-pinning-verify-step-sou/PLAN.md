All inputs resolved. Writing PLAN.md to stdout now.

# Implementation Plan: Cycle 0094

## Overview
Add the source-mutation guard to `src/defaults/scripts/verify.sh` (carry-forward from cycle 0093, which was permission-blocked), then add a four-case integration test suite in `tests/defaults/verify.test.ts` and two static assertions in `tests/defaults/scripts.test.ts` to pin guard behavior permanently.

## Current State (from Research)

- `src/defaults/scripts/verify.sh` (17 lines): header + `set -euo pipefail` + `if [ -f package.json ]` dispatch block. No mutation guard. `.cycle/scripts/verify.sh` is byte-identical.
- `CYCLE_BASE` injected by `run-cycle.ts:127` as `process.env.CYCLE_BASE ?? "main"`; `:-master` fallback serves standalone/dogfood invocations.
- `tests/defaults/scripts.test.ts` (19 lines): static `assert.match` assertions on script body strings — no subprocess, no tmp repos. Pattern to extend.
- `tests/defaults/commit_sh.test.ts` (120 lines): authoritative reference for integration test pattern — inline `run`, `makeRepo`, `runScript`, `commitFilesWithStatus` helpers; `mkdtemp` → git init/config → seed commit → copy script → `spawnSync`; try/finally cleanup.
- `tests/defaults/verify.test.ts`: does not exist.
- 434+ tests currently passing.

## Desired End State

- `src/defaults/scripts/verify.sh` is 23 lines: guard block (5 lines) inserted after `set -euo pipefail`, before `if [ -f package.json ]`.
- `src/defaults/scripts/verify.sh` and `.cycle/scripts/verify.sh` are byte-identical.
- `tests/defaults/verify.test.ts` exists with four integration tests, each asserting exact exit codes via `assert.equal(r.status, N)`.
- `tests/defaults/scripts.test.ts` has one new test with ≥ 6 static assertions covering guard shape.
- `npm test` exits 0 with 438+ tests passing; `npm run typecheck` exits 0; coverage baseline unchanged.

## What We're NOT Doing

- Modifying `verify.sh`'s test-runner dispatch block (the `if [ -f package.json ]` tree).
- Adding byte-identical sync assertion tests (out of scope per SPEC).
- Extracting shared helpers (`makeRepo`/`runScript`) into a module — `refl-0068` not yet done; follow inline pattern.
- Changing how/where `CYCLE_BASE` is set by the engine.
- Adding E2E tests for the full workflow cycle.
- Modifying workflow YAML, prompts, or other scripts.

## Implementation Approach

The guard uses `if ! git diff --name-only "$BASE"...HEAD | grep -qv '^docs/cycle/'`. The `if !` condition suppresses `set -e` for the entire pipeline, so `pipefail` is inert here and no `|| true` guard is needed. `grep -qv` exits 1 when no non-`docs/cycle/` path appears (handles both empty diff AND all-docs-cycle diff in one expression). Inserted between `set -euo pipefail` (line 4) and the `if [ -f package.json ]` dispatch block (line 6).

Integration tests use `mkdtemp` git repos with `CYCLE_BASE` set to an exact commit SHA captured immediately after the seed commit via `git rev-parse HEAD`. Each test commits its scenario-specific changes on top of that base, then invokes `bash .cycle/scripts/verify.sh` (exercising the sync-defaults copy path, consistent with `commit_sh.test.ts`).

---

## Task 1: Add mutation guard to `src/defaults/scripts/verify.sh`

### Overview
Insert the `CYCLE_BASE` guard block (5 lines) between `set -euo pipefail` and `if [ -f package.json ]`. Verbatim carry-forward from cycle 0093 PLAN Task 1.

### Changes Required

**File**: `src/defaults/scripts/verify.sh`

Replace the current 17-line file with this 23-line version:

```bash
#!/usr/bin/env bash
# Default verify script. Runs the test suite if a typical project file is present.
# Overridden per-repo when a project has a custom verify.
set -euo pipefail

BASE="${CYCLE_BASE:-master}"
if ! git diff --name-only "$BASE"...HEAD | grep -qv '^docs/cycle/'; then
  echo "verify: no src changes outside docs/cycle/ relative to $BASE" >&2
  exit 1
fi

if [ -f package.json ] && grep -q '"test"' package.json; then
  if [ ! -d node_modules ]; then
    npm install
  fi
  npm test
elif [ -f Cargo.toml ]; then
  cargo test
elif [ -f pyproject.toml ]; then
  pytest
else
  echo "verify.sh: no test runner detected; passing trivially"
fi
```

### Success Criteria
- [ ] `src/defaults/scripts/verify.sh` contains `BASE="${CYCLE_BASE:-master}"`
- [ ] File contains `git diff --name-only "$BASE"...HEAD | grep -qv '^docs/cycle/'`
- [ ] Stderr message matches `"no src changes outside docs/cycle/ relative to $BASE"`
- [ ] Message redirected via `>&2`
- [ ] `exit 1` present in guard block
- [ ] Guard appears before the `if [ -f package.json ]` dispatch block
- [ ] File is exactly 23 lines

---

## Task 2: Add static assertions to `tests/defaults/scripts.test.ts`

### Overview
Append a new test after line 19 with 6 `assert.match` assertions covering all testable static-text properties of the guard.

### Changes Required

**File**: `tests/defaults/scripts.test.ts`

Append after line 19:

```typescript
test("verify.sh has source-mutation guard", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.match(body, /git diff --name-only/, "verify.sh should have git diff guard");
  assert.match(body, /CYCLE_BASE:-master/, "verify.sh should fallback CYCLE_BASE to master");
  assert.match(body, /docs\/cycle\//, "verify.sh should filter docs/cycle/ paths");
  assert.match(body, />&2/, "verify.sh guard should write to stderr");
  assert.match(body, /exit 1/, "verify.sh guard should exit 1 on failure");
  assert.match(body, /no src changes/, "verify.sh guard message should say 'no src changes'");
});
```

No new imports required — `readFile` is already imported at line 3.

### Success Criteria
- [ ] New test contains exactly 6 `assert.match` assertions
- [ ] First two cover `/git diff --name-only/` and `/CYCLE_BASE:-master/` (SPEC minimum)
- [ ] `npm test` runs the new test without skipping

---

## Task 3: Create `tests/defaults/verify.test.ts` with four integration tests

### Overview
New file implementing `makeRepo`/`runScript`/`run` inline helpers (same pattern as `commit_sh.test.ts`), then four test cases each asserting exact exit codes. `makeRepo` returns both `root` and `baseSha` so tests can supply `CYCLE_BASE=<sha>`.

### Changes Required

**File**: `tests/defaults/verify.test.ts` (new file)

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, copyFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function run(cwd: string, cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} (cwd=${cwd}) failed [${r.status}]: ${r.stderr}`);
  }
  return r;
}

async function makeRepo(): Promise<{ root: string; baseSha: string }> {
  const root = await mkdtemp(join(tmpdir(), "cycle-verify-sh-"));
  run(root, "git", ["init", "-q"]);
  run(root, "git", ["config", "user.email", "test@example.com"]);
  run(root, "git", ["config", "user.name", "Test"]);
  run(root, "git", ["config", "commit.gpgsign", "false"]);
  await writeFile(join(root, "README.md"), "seed\n");
  run(root, "git", ["add", "README.md"]);
  run(root, "git", ["commit", "-q", "-m", "seed"]);
  const baseSha = run(root, "git", ["rev-parse", "HEAD"]).stdout.trim();
  const scripts = join(root, ".cycle/scripts");
  await mkdir(scripts, { recursive: true });
  await copyFile("src/defaults/scripts/verify.sh", join(scripts, "verify.sh"));
  await chmod(join(scripts, "verify.sh"), 0o755);
  return { root, baseSha };
}

function runScript(cwd: string, env: Record<string, string> = {}) {
  return spawnSync("bash", [".cycle/scripts/verify.sh"], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("verify.sh exits 1 when only docs/cycle/ paths changed", async () => {
  const { root, baseSha } = await makeRepo();
  try {
    await mkdir(join(root, "docs/cycle"), { recursive: true });
    await writeFile(join(root, "docs/cycle/artifact.md"), "artifact\n");
    run(root, "git", ["add", "docs/cycle/artifact.md"]);
    run(root, "git", ["commit", "-q", "-m", "docs only"]);
    const r = runScript(root, { CYCLE_BASE: baseSha });
    assert.equal(r.status, 1, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /no src changes/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verify.sh exits 0 when mixed docs/cycle/ and src/ paths changed", async () => {
  const { root, baseSha } = await makeRepo();
  try {
    await mkdir(join(root, "docs/cycle"), { recursive: true });
    await writeFile(join(root, "docs/cycle/artifact.md"), "artifact\n");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/app.ts"), "export {};\n");
    run(root, "git", ["add", "docs/cycle/artifact.md", "src/app.ts"]);
    run(root, "git", ["commit", "-q", "-m", "mixed"]);
    const r = runScript(root, { CYCLE_BASE: baseSha });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verify.sh exits 1 when no changes since base", async () => {
  const { root, baseSha } = await makeRepo();
  try {
    const r = runScript(root, { CYCLE_BASE: baseSha });
    assert.equal(r.status, 1, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /no src changes/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verify.sh exits 0 when only src/ paths changed", async () => {
  const { root, baseSha } = await makeRepo();
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/app.ts"), "export {};\n");
    run(root, "git", ["add", "src/app.ts"]);
    run(root, "git", ["commit", "-q", "-m", "src only"]);
    const r = runScript(root, { CYCLE_BASE: baseSha });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Key design decisions
- `makeRepo` returns `{ root, baseSha }` (not just `root`) — baseSha is captured via `git rev-parse HEAD` immediately after the seed commit so `CYCLE_BASE=<sha>` resolves to an exact object, independent of branch name. The temp repo has no `master`/`main` remote ref.
- Mixed-path test commits both a `docs/cycle/` file and a `src/` file in one commit — ensures `grep -qv` finds the `src/` path and returns 0.
- No-changes test makes zero commits after `makeRepo` — `git diff "$BASE"...HEAD` is empty → `grep -qv` exits 1.
- Exit-0 tests assert `r.status === 0`; no `assert.match(r.stderr, ...)` needed since normal path is silent on stderr.
- Temp repos have no `package.json`/`Cargo.toml`/`pyproject.toml`, so the dispatch block falls to `echo "verify.sh: no test runner detected; passing trivially"` on exit-0 paths.

### Success Criteria
- [ ] File exists at `tests/defaults/verify.test.ts`
- [ ] All four tests present with explicit `assert.equal(r.status, N)` assertions
- [ ] Exit-1 tests also assert `assert.match(r.stderr, /no src changes/)`
- [ ] `npm test` discovers and runs all four new tests
- [ ] All four pass

---

## Task 4: Sync defaults and verify full suite

### Overview
Run `npm run sync-defaults` to mirror `src/defaults/scripts/verify.sh` → `.cycle/scripts/verify.sh`, then verify the full test suite and coverage.

### Changes Required

**Command**: `npm run sync-defaults`
- Both files are currently byte-identical, so the divergence guard will not trigger; clean sync.
- `.cycle/.sync-state.json` updated with new sha256 for `verify.sh`.

**Command**: `diff src/defaults/scripts/verify.sh .cycle/scripts/verify.sh`
- Must exit 0 (byte-identical confirmation).

**Command**: `npm run typecheck`
- Must exit 0 (no TS errors; new `.test.ts` uses only `node:*` builtins already in scope).

**Command**: `npm test`
- `pretest` builds `dist/cycle.js`; native test runner discovers all `.test.ts` files.
- New tests: 1 static (`scripts.test.ts`) + 4 integration (`verify.test.ts`) = 5 new tests → 439+ total.
- All 434+ prior tests must still pass.

**Command**: `npm run test:coverage`
- No `src/` TS changes, so line/branch/function metrics are unaffected.
- Per-file floor for `src/engine/triage.ts ≥ 95%` unaffected.

### Success Criteria
- [ ] `diff src/defaults/scripts/verify.sh .cycle/scripts/verify.sh` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0 with 439+ tests passing
- [ ] `npm run test:coverage` shows coverage ≥ baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/defaults/scripts/verify.sh contains BASE="${CYCLE_BASE:-master}" and the grep -qv '^docs/cycle/' guard block before the if [ -f package.json ] dispatch` | Task 1 | Guard inserted after `set -euo pipefail` (line 4), before `if [ -f package.json ]` (now line 12) |
| `[ ] src/defaults/scripts/verify.sh and .cycle/scripts/verify.sh are byte-identical after npm run sync-defaults` | Task 4 | `diff` command confirms; sync-defaults has no divergence to block |
| `[ ] tests/defaults/verify.test.ts exists and covers all four cases with explicit assert.equal(r.status, <N>) assertions: only docs/cycle/ changes → exits 1` | Task 3 | Test 1: docs-only commit → `assert.equal(r.status, 1)` |
| `[ ] mixed docs/cycle/ + src/ changes → exits 0` | Task 3 | Test 2: mixed commit → `assert.equal(r.status, 0)` |
| `[ ] no changes at all → exits 1` | Task 3 | Test 3: no commit after base → `assert.equal(r.status, 1)` |
| `[ ] only src/ changes → exits 0` | Task 3 | Test 4: src-only commit → `assert.equal(r.status, 0)` |
| `[ ] tests/defaults/scripts.test.ts has at least two new static assertions: guard pattern present and CYCLE_BASE:-master fallback present` | Task 2 | New test has 6 assertions; first two are `/git diff --name-only/` and `/CYCLE_BASE:-master/` |
| `[ ] All existing 434+ tests still pass (npm test exits 0)` | Task 4 | Full suite run confirms |
| `[ ] No compiler/linter warnings (npm run typecheck exits 0)` | Task 4 | Verified before commit |
| `[ ] Coverage baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%) not decreased` | Task 4 | No `src/` TS changes; bash script not counted in TS coverage |

---

## Testing Strategy

### Unit Tests
- **Static body assertions** (`tests/defaults/scripts.test.ts`): 6 `assert.match` calls on UTF-8 file read of `src/defaults/scripts/verify.sh`. No subprocess. Covers guard pattern, `CYCLE_BASE:-master` fallback, `docs/cycle/` filter, `>&2`, `exit 1`, and error message text.

### Integration Tests
- **Four-case suite** (`tests/defaults/verify.test.ts`): Each test uses `mkdtemp` isolated git repo, captures base SHA immediately after seed commit, makes scenario-specific commits (or none), runs `bash .cycle/scripts/verify.sh` with `CYCLE_BASE=<sha>`, asserts `r.status`. No mocking — real `git` and `bash` processes.
- Exit-1 paths additionally assert `r.stderr` matches `/no src changes/` to pin the message text.
- Temp repo lacks any test runner config file, so exit-0 paths fall through to `echo "no test runner detected"` (exits 0 trivially).

## Risk Assessment
- **`set -e` + empty diff**: Mitigated — `if !` condition suppresses `set -e` for the entire pipeline. `grep -qv` on empty input exits 1 cleanly; no `|| true` needed.
- **`git rev-parse HEAD` in temp repo**: No remote refs present; SHA-based `CYCLE_BASE` bypasses any branch-name lookup, making tests hermetic.
- **Sync divergence guard**: Both files currently byte-identical → no divergence state; `sync-defaults` copies cleanly on first run after Task 1.
- **Coverage regression**: Guard is bash; TS coverage metrics are unaffected. Per-file floor for `triage.ts` unaffected.
