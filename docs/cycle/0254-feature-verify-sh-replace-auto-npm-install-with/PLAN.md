# Implementation Plan: Cycle 0254

## Overview

Replace the `npm install` auto-install fallback in `src/defaults/scripts/verify.sh` with three fail-fast guards that exit 1 with actionable operator messages: missing `node_modules/` in a Node repo, missing `pytest` in a Python repo, and no recognized test runner. Run `npm run sync-defaults` to propagate to `.cycle/scripts/verify.sh`.

## Current State (from Research)

- `src/defaults/scripts/verify.sh` (17 lines) silently runs `npm install` when `node_modules/` is absent, calls `pytest` without checking availability, and exits 0 with an echo when no test runner is detected.
- `tests/defaults/scripts.test.ts:15-19` contains one test that asserts `npm install` presence — it must be replaced; the shebang/executable test at lines 6-12 is unaffected.
- `.cycle/.sync-state.json` records matching `src_sha256` and `dst_sha256` for `verify.sh`. After editing only the source, the divergence guard evaluates `dstSha !== recorded.dst_sha256` → false, so plain `npm run sync-defaults` propagates the change without `--force`.
- No other test file reads `src/defaults/scripts/verify.sh` content; all other tests that reference `verify.sh` write their own stubs.

## Desired End State

- `src/defaults/scripts/verify.sh` contains no `npm install` invocation, exits 1 on the three fail-fast paths, and has an updated top-of-file comment declaring strict intent.
- `.cycle/scripts/verify.sh` is byte-for-byte identical to `src/defaults/scripts/verify.sh`.
- `tests/defaults/scripts.test.ts` replaces the one broken test with four content-inspection tests covering the new behavior.
- `npm test` passes with all gates green.

## What We're NOT Doing

- No changes to any other default script (`commit.sh`, `commit-trunk.sh`, `pr.sh`, etc.).
- No per-repo customization mechanism — it already exists (operators replace `.cycle/scripts/verify.sh`).
- No structural invariant in `scripts/structural-invariants.mjs` for `verify.sh` content.
- No Python test runner detection beyond `pytest` availability.
- No automated shell-script execution harness — correctness verified by content inspection and manual smoke test documented in `BUILD.md`.

## Implementation Approach

All changes are local to two files plus the sync step. Edit `src/defaults/scripts/verify.sh` first, then update the one breaking test in `tests/defaults/scripts.test.ts`, then run `npm run sync-defaults` (no `--force` required), then confirm `npm test` passes. The changes are purely additive replacements — no new abstractions, no new dependencies.

---

## Task 1: Replace verify.sh content

### Overview

Rewrite `src/defaults/scripts/verify.sh` with the three fail-fast guards and an updated top-of-file comment. The shebang, `set -euo pipefail`, and the Rust/happy-path Node branches are preserved unchanged.

### Changes Required

**File**: `src/defaults/scripts/verify.sh`

Replace the entire file content with:

```bash
#!/usr/bin/env bash
# Default verify script — intentionally strict. Missing dependencies are an
# operator problem, not a cycle problem. Replace with a repo-specific
# .cycle/scripts/verify.sh when these defaults do not fit your project.
set -euo pipefail

if [ -f package.json ] && grep -q '"test"' package.json; then
  if [ ! -d node_modules ]; then
    echo "verify.sh: node_modules/ not found. Run 'npm install' before starting cycle." >&2
    exit 1
  fi
  npm test
elif [ -f Cargo.toml ]; then
  cargo test
elif [ -f pyproject.toml ]; then
  if ! command -v pytest &>/dev/null; then
    echo "verify.sh: pytest not found on PATH. Install it before starting cycle." >&2
    exit 1
  fi
  pytest
else
  echo "verify.sh: no recognized test runner detected. Write a custom .cycle/scripts/verify.sh for this repo." >&2
  exit 1
fi
```

Key changes vs current:
- Comment updated to declare strict intent and direct operators to write a custom script
- `npm install` block replaced with `exit 1` guard printing to stderr
- `pytest` call wrapped in `command -v pytest` availability guard
- Trivial `echo "...passing trivially"` fallback replaced with `exit 1` + actionable stderr message

### Success Criteria

- [ ] `src/defaults/scripts/verify.sh` contains no `npm install` string
- [ ] Node fail-fast branch: `! -d node_modules` → stderr message + `exit 1`
- [ ] Python fail-fast branch: `! command -v pytest` → stderr message + `exit 1`
- [ ] No-runner fallback: `exit 1` + message referencing custom `verify.sh`
- [ ] File remains executable (mode `0755` unchanged — no `chmod` needed, `Write` preserves mode)
- [ ] Shebang line remains `#!/usr/bin/env bash`

---

## Task 2: Update tests/defaults/scripts.test.ts

### Overview

Replace the single breaking test at lines 15-19 with four content-inspection tests that assert the new behavior. The existing shebang/executable test at lines 6-12 is untouched.

### Changes Required

**File**: `tests/defaults/scripts.test.ts`

Replace lines 15-19:

```typescript
test("verify.sh installs deps when node_modules is missing", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.match(body, /npm install/, "verify.sh should invoke npm install");
  assert.match(body, /node_modules/, "verify.sh should reference node_modules");
});
```

With:

```typescript
test("verify.sh does not invoke npm install", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.doesNotMatch(body, /npm install/, "verify.sh must not invoke npm install");
});

test("verify.sh exits 1 with actionable message when node_modules is absent", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.match(body, /node_modules/, "verify.sh must reference node_modules dir");
  assert.match(body, /exit 1/, "verify.sh must exit 1 on fail-fast paths");
});

test("verify.sh checks pytest availability before invoking it", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.match(body, /command -v pytest/, "verify.sh must guard pytest availability");
});

test("verify.sh exits 1 with custom-script direction when no runner detected", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.doesNotMatch(body, /passing trivially/, "verify.sh must not pass trivially");
  assert.match(body, /custom.*verify\.sh/, "verify.sh must direct operator to write custom script");
});
```

### Success Criteria

- [ ] Old test name "verify.sh installs deps when node_modules is missing" no longer exists in the file
- [ ] Four new tests cover: no-npm-install, node-fail-fast, pytest-guard, no-runner-fail-fast
- [ ] `npm test` runs all four new tests without failures
- [ ] Shebang/executable test (lines 6-12) is unchanged

---

## Task 3: Propagate to .cycle/scripts/verify.sh via sync-defaults

### Overview

Run `npm run sync-defaults` to copy the updated `src/defaults/scripts/verify.sh` to `.cycle/scripts/verify.sh`. No `--force` is required: the divergence guard evaluates `dstSha !== recorded.dst_sha256` as false (dst is still on the old recorded hash), so the sync proceeds normally.

### Changes Required

Run: `npm run sync-defaults`

Expected output: `synced src/defaults/scripts/verify.sh → .cycle/scripts/verify.sh`

`.cycle/.sync-state.json` will be updated with the new sha256 pair for `".cycle/scripts/verify.sh"`.

### Success Criteria

- [ ] `npm run sync-defaults` exits 0
- [ ] `.cycle/scripts/verify.sh` content is byte-for-byte identical to `src/defaults/scripts/verify.sh`
- [ ] `.cycle/.sync-state.json` records updated `src_sha256` and `dst_sha256` for `.cycle/scripts/verify.sh`
- [ ] No "skipped" or "locally divergent" output in sync-defaults stderr

---

## Task 4: Full test suite verification

### Overview

Run `npm test` (which includes build, tests, coverage, and invariants) to confirm all gates pass.

### Changes Required

None — this is a verification step only.

### Success Criteria

- [ ] `npm test` exits 0
- [ ] No regressions in existing test suite
- [ ] Coverage remains ≥ baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)
- [ ] `check:invariants` passes

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] verify.sh contains no npm install invocation` | Task 1, Task 2 | Task 1 removes it; Task 2 asserts its absence |
| `[ ] Running verify.sh in a Node repo with absent node_modules/ exits with code 1 and prints an actionable message to stderr` | Task 1, Task 2 | Task 1 implements guard; Task 2 content-inspects the guard |
| `[ ] Running verify.sh in a Python repo without pytest on PATH exits with code 1 and prints an actionable message to stderr` | Task 1, Task 2 | Task 1 adds `command -v pytest` guard; Task 2 asserts the pattern |
| `[ ] Running verify.sh in a repo with no recognized test runner exits with code 1 and directs the operator to write a custom verify.sh` | Task 1, Task 2 | Task 1 replaces trivial echo with exit 1; Task 2 asserts no "passing trivially" and presence of "custom.*verify.sh" |
| `[ ] Running verify.sh in a Node repo with node_modules/ present exits 0 (assuming npm test passes)` | Task 1 | Happy-path Node branch preserved; verified by manual smoke test in BUILD.md |
| `[ ] .cycle/scripts/verify.sh matches src/defaults/scripts/verify.sh after npm run sync-defaults` | Task 3 | Plain `npm run sync-defaults` suffices; no `--force` required |
| `[ ] All existing tests pass (npm test)` | Task 4 | Full suite run after all changes |

---

## Testing Strategy

### Unit Tests

- **Content-inspection tests** (`tests/defaults/scripts.test.ts`): Four new tests read `src/defaults/scripts/verify.sh` and assert structural properties using `assert.match` / `assert.doesNotMatch`. No execution of the script is required for these tests.
- No mocking needed — tests use real filesystem reads of the source file.
- The shebang/executable test already covers mode and first-line format.

### Manual Smoke Test (document in BUILD.md)

Three tmpdir runs to confirm exit behavior:

1. **No-runner path**: Empty tmpdir (no `package.json`, no `Cargo.toml`, no `pyproject.toml`) → `bash src/defaults/scripts/verify.sh` must exit 1 with stderr message referencing custom `verify.sh`.
2. **Node fail-fast path**: Tmpdir with `package.json` containing a `"test"` key, no `node_modules/` → must exit 1 with "Run 'npm install'" message on stderr.
3. **Python fail-fast path**: Tmpdir with `pyproject.toml`, `pytest` removed from PATH via `env -i PATH=/nonexistent` → must exit 1 with "Install it before starting cycle" message on stderr.

These smoke tests are manual verification steps, not automated; document results in `BUILD.md`.

## Risk Assessment

- **sync-defaults guard misfire**: RESEARCH.md flagged `--force` might be needed. Analysis of the guard logic confirms it will not fire (dst sha equals recorded dst sha → `isDivergent` evaluates to false). Plain `npm run sync-defaults` is safe.
- **File mode preservation**: Overwriting `src/defaults/scripts/verify.sh` via `Write` tool may not preserve the executable bit. After writing, verify `stat src/defaults/scripts/verify.sh` shows mode `0755`; if not, run `chmod +x src/defaults/scripts/verify.sh`.
- **Test count delta**: Replacing 1 test with 4 increases the test count by 3. Coverage metrics should remain stable or improve (same file, more assertions).
