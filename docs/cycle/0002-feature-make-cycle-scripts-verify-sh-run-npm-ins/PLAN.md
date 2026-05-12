Plan inputs absorbed. Writing PLAN to stdout for engine capture.

```markdown
# Implementation Plan: Cycle 0002

## Overview
Make `src/defaults/scripts/verify.sh` auto-run `npm install` when `package.json` declares a `"test"` script but `node_modules/` is missing, then run `npm test`. Extend `tests/defaults/scripts.test.ts` with a static assertion that the install-on-missing guard exists, while preserving the existing shebang + executable-bit checks.

## Current State (from Research)
- `src/defaults/scripts/verify.sh` (15 lines, `set -euo pipefail`) has three runner branches; Node branch is `if [ -f package.json ] && grep -q '"test"' package.json; then npm test` at lines 6–7.
- `tests/defaults/scripts.test.ts` loops over `verify.sh`, `commit.sh`, `pr.sh` and asserts only shebang + executable bit. No body-content assertion yet.
- Suite is 26 tests, all passing. Test runner: `node --test --experimental-strip-types --test-reporter=spec`. Assertions use `node:assert/strict` + `assert.match`.
- Build pipeline stages `src/defaults/` alongside the engine bundle; editing the source file is sufficient — no rebuild required for the assertion, since the test reads from `src/defaults/scripts/verify.sh` directly.
- Installed copy `.cycle/scripts/verify.sh` is explicitly out of scope (propagates via `init --upgrade`).

## Desired End State
- `src/defaults/scripts/verify.sh` Node branch reads:
  ```bash
  if [ -f package.json ] && grep -q '"test"' package.json; then
    if [ ! -d node_modules ]; then
      npm install
    fi
    npm test
  elif ...
  ```
- `tests/defaults/scripts.test.ts` adds a verify-only `test(...)` block asserting `verify.sh` body contains both `npm install` and a `node_modules` existence check, alongside retained shebang/exec-bit coverage.
- `npm test` → 27 tests pass (26 existing + 1 new). `npm run build` succeeds clean.
- Manual sanity: scratch dir with minimal `package.json` (with `"test"` script) and no `node_modules/` → `bash src/defaults/scripts/verify.sh` installs deps then runs tests; with `node_modules/` present → skips install.

## What We're NOT Doing
- No edits to Cargo/`pyproject` branches (no parallel install guard).
- No support for pnpm, yarn, or other package managers.
- No engine, workflow YAML, prompt, or sibling-script (`commit.sh`, `pr.sh`) changes.
- No `npm run build` invocation inside `verify.sh`.
- No regeneration / hand-copy of `.cycle/scripts/verify.sh` (out of cycle scope; propagates via `init --upgrade`).
- No new E2E test; static assertion is sufficient per SPEC.
- No README, CLAUDE.md, AGENTS.md, or BRIEF.md changes (per SPEC §Documentation Updates).

## Implementation Approach
Two tightly scoped edits delivered as a single vertical slice:
1. Shell change inside the Node branch of `src/defaults/scripts/verify.sh` — a four-line `if [ ! -d node_modules ]; then npm install; fi` block before `npm test`. `set -euo pipefail` already guarantees install-failure propagation; no additional error handling needed.
2. Test change in `tests/defaults/scripts.test.ts` — new `test(...)` block (outside the existing loop) that reads `src/defaults/scripts/verify.sh` once and runs two `assert.match` calls: one for `/npm install/`, one for `/node_modules/`. Two regexes (not one compound) keeps each assertion independently informative when one fails and accepts either `[ ! -d node_modules ]` or `[[ ! -d node_modules ]]` formatting.

This is the smallest change that satisfies all acceptance criteria. No abstraction, no refactor, no scope creep.

---

## Task 1: Add install-on-missing guard to verify.sh Node branch

### Overview
Insert a `node_modules` existence check that runs `npm install` before `npm test`, only when `node_modules/` is absent.

### Changes Required
**File**: `src/defaults/scripts/verify.sh`
**Changes**: Replace the Node branch body (currently a single `npm test`) with a guarded install + `npm test`:

```bash
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

Preserve:
- Line 1 shebang `#!/usr/bin/env bash` (unchanged).
- Line 4 `set -euo pipefail` (unchanged).
- Executable mode bit on the file (no `chmod` needed; only body changes).
- The two non-Node branches (`Cargo.toml`, `pyproject.toml`) and the final `else` (untouched).

### Success Criteria
- [ ] `verify.sh` line 1 still matches `^#!/usr/bin/env bash`.
- [ ] `verify.sh` retains executable bit (mode & 0o111 != 0).
- [ ] Node branch contains both `npm install` and a `node_modules` existence check.
- [ ] `npm test` is the last command on the Node branch (after the install guard).
- [ ] Cargo and Python branches unchanged.
- [ ] `bash -n src/defaults/scripts/verify.sh` parses cleanly (no syntax errors).
- [ ] Manual sanity: scratch dir with `package.json` (`"test"` script) + no `node_modules/` → script runs `npm install` then `npm test`; with `node_modules/` present → install is skipped.

---

## Task 2: Assert install-on-missing guard in defaults-script tests

### Overview
Add a verify-only `test(...)` block to `tests/defaults/scripts.test.ts` asserting `verify.sh` contains both an `npm install` invocation and a `node_modules` existence check. Existing loop (shebang + exec bit across all three scripts) is left intact.

### Changes Required
**File**: `tests/defaults/scripts.test.ts`
**Changes**: Append a new `test(...)` block after the existing loop:

```ts
test("verify.sh installs deps when node_modules is missing", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.match(body, /npm install/, "verify.sh should invoke npm install");
  assert.match(body, /node_modules/, "verify.sh should reference node_modules");
});
```

Rationale for two separate `assert.match` calls vs one compound regex (resolves RESEARCH open question):
- Permissive enough to tolerate `[ ! -d node_modules ]` or `[[ ! -d node_modules ]]`.
- Each failure mode (missing install vs missing guard) surfaces its own assertion message.
- Matches existing style — file already uses `assert.match` with regex literals.

Placement choice (resolves RESEARCH open question): new top-level `test(...)` block after the loop, not a conditional inside the loop. Keeps the loop's shared-contract semantics (shebang + exec bit applies to all three scripts) cleanly separated from verify-only invariants.

### Success Criteria
- [ ] New `test(...)` block is named `"verify.sh installs deps when node_modules is missing"`.
- [ ] Both `assert.match` calls present (`/npm install/` and `/node_modules/`).
- [ ] Existing shebang + exec-bit loop unchanged (still covers all three scripts).
- [ ] `npm test` runs 27 tests; all pass.
- [ ] No new imports needed (`readFile` already imported; `test` + `assert` already imported).

---

## Testing Strategy

### Unit Tests
- **New static assertion** (Task 2): regex matches against `verify.sh` body for `npm install` and `node_modules`. Reads real file from `src/defaults/scripts/verify.sh` — no mocking. Real fs read is the established pattern in this file.
- **Retained assertions**: shebang regex on line 1 + executable mode bit, looped across `verify.sh`, `commit.sh`, `pr.sh`.

### Integration / E2E Tests
- None new. Per SPEC §Testing Strategy: "No new E2E: purely a shell-script change inside the defaults surface."
- **Manual sanity check** (gated by Task 1 success criteria): in a tmp directory with a minimal `package.json` containing `{"scripts":{"test":"node -e 'process.exit(0)'"}}`:
  1. With no `node_modules/`: `bash <repo>/src/defaults/scripts/verify.sh` → installs deps, then `npm test` exits 0.
  2. With `node_modules/` pre-created (`mkdir node_modules`): same command → skips install, runs `npm test` directly.

### Regression Coverage
- Existing 26 tests must continue to pass; new total = 27. Run `npm test` after Task 1 and again after Task 2.
- `npm run build` must complete clean (no TS / esbuild warnings). Build is not strictly required to validate the test (which reads from `src/defaults/`), but SPEC acceptance lists it.

### Mocking Strategy
- Zero mocks. Test reads the real `verify.sh` source file via `node:fs/promises`. Anti-mock bias respected — no shell execution mock, no fs mock.

## Risk Assessment
- **Risk**: A future formatting tweak (e.g. switching `[ ! -d node_modules ]` to `[[ ! -d node_modules ]]`, or moving install to a function) breaks the static assertion. **Mitigation**: regexes are deliberately permissive — `/npm install/` and `/node_modules/` match the substrings anywhere in the file, surviving most reasonable rewrites.
- **Risk**: `npm install` failure (network outage, lockfile mismatch) now aborts `verify.sh` where previously it might have surfaced as a test-time error. **Mitigation**: behavior is intentional per SPEC; `set -euo pipefail` already in place; `step.end status=failed` event surfaces in `.cycle/log.jsonl`. Acceptable risk.
- **Risk**: The installed copy `.cycle/scripts/verify.sh` in this repo remains on the old logic until next `cycle init --upgrade`. **Mitigation**: explicitly out of scope per SPEC; propagation deferred to a separate cycle. Document in commit message that `init --upgrade` is the propagation path.
- **Risk**: User runs verify in a directory with a stale `node_modules/` from a different lockfile. **Mitigation**: out of scope — SPEC explicitly says "if `node_modules/` already exists, behavior is unchanged." Users with stale deps should `rm -rf node_modules` themselves.
```
