Resolving open questions from RESEARCH and writing the plan.

The `set -e` safe approach: use `if ! git diff ... | grep -qv '^docs/cycle/'` — the `if` condition suppresses `set -e` for the pipeline, so no `|| true` needed. `grep -qv` exits 1 on no matches (empty diff or all-docs-cycle paths), triggering the failure path correctly.

`CYCLE_BASE:-master` fallback is intentional: engine supplies `CYCLE_BASE=main` for consumer repos; the `master` fallback serves manual/dogfood invocations on the `master` branch. Independent — no conflict.

```markdown
# Implementation Plan: Cycle 0093

## Overview
Add a pre-check to `verify.sh` that exits 1 with a stderr message when a cycle branch has changed only `docs/cycle/` paths (or nothing) relative to the base commit. This closes the false-positive drain where permission-blocked agents write only artifact prose and the engine records `cycle.end status:ok` with zero source files touched.

## Current State (from Research)
- `src/defaults/scripts/verify.sh` (17 lines): `set -euo pipefail` header, then a `if [ -f package.json ]` block dispatching to `npm test`/`cargo test`/`pytest`. No mutation guard exists.
- `.cycle/scripts/verify.sh`: byte-identical to the src copy (confirmed via diff). Updated via `npm run sync-defaults`.
- `tests/defaults/scripts.test.ts` (19 lines): static `assert.match` assertions on script body strings. Pattern: `readFile("src/defaults/scripts/verify.sh", "utf8")` then `assert.match(body, /regex/)`.
- `CYCLE_BASE` env var: injected by `run-cycle.ts:127` as `process.env.CYCLE_BASE ?? "main"` into `cycleEnv`, passed to bash steps via `execBashStep`. Script-side fallback `${CYCLE_BASE:-master}` is for standalone/manual invocation on the dogfood repo.

## Desired End State
- `src/defaults/scripts/verify.sh`: 6–8 lines prepended after `set -euo pipefail` implementing the guard. Two new static assertions in `tests/defaults/scripts.test.ts`. Both `src/` and `.cycle/` copies byte-identical. `npm test` passes.

## What We're NOT Doing
- Modifying `verify.sh`'s test-runner dispatch block.
- Adding integration tests that run `verify.sh` in a real git repo.
- Changing how/where `CYCLE_BASE` is set by the engine.
- Modifying workflow YAML, prompts, or any other script.
- Adding a byte-identical assertion test for the `src/defaults`→`.cycle/` pair (SPEC only requires 2 new assertions).

## Implementation Approach
Use `if ! git diff --name-only "$BASE"...HEAD | grep -qv '^docs/cycle/'` as the guard expression. The `if` condition suppresses `set -e` for the pipeline, so no `|| true` guard is needed and `pipefail` is inert here. `grep -qv` exits 1 when no non-`docs/cycle/` path appears (empty diff OR all-docs-cycle diff) — both SPEC cases handled by one expression. The failure message is written to stderr via `>&2`. Guard is inserted between `set -euo pipefail` (line 4) and the `if [ -f package.json ]` dispatch block (line 6), with a blank separator line.

---

## Task 1: Add mutation guard to `src/defaults/scripts/verify.sh`

### Overview
Insert the `CYCLE_BASE` guard block between the `set -euo pipefail` line and the test-runner dispatch block. This is the primary deliverable of the cycle.

### Changes Required
**File**: `src/defaults/scripts/verify.sh`

Insert after line 4 (`set -euo pipefail`), before line 6 (`if [ -f package.json ]`):

```bash

BASE="${CYCLE_BASE:-master}"
if ! git diff --name-only "$BASE"...HEAD | grep -qv '^docs/cycle/'; then
  echo "verify: no src changes outside docs/cycle/ relative to $BASE" >&2
  exit 1
fi
```

Final file (18 lines → 23 lines):
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
- [ ] File contains `BASE="${CYCLE_BASE:-master}"`
- [ ] File contains `git diff --name-only "$BASE"...HEAD | grep -qv '^docs/cycle/'`
- [ ] Failure message contains `"no src changes"` and references `$BASE`
- [ ] Message redirected to stderr (`>&2`)
- [ ] `exit 1` present in guard block
- [ ] Guard appears before the `if [ -f package.json ]` dispatch block

---

## Task 2: Add static assertions to `tests/defaults/scripts.test.ts`

### Overview
Append two new `assert.match` assertions to the existing `"verify.sh installs deps"` test (or add a new test) covering the guard pattern and `CYCLE_BASE` fallback.

### Changes Required
**File**: `tests/defaults/scripts.test.ts`

Add a new test after line 19:

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

This covers all SPEC acceptance criteria items that have testable static-text representations. The assertions match the patterns enumerated in SPEC.md's Testing Strategy section.

### Success Criteria
- [ ] New test contains at least the two SPEC-required assertions: guard pattern + CYCLE_BASE fallback
- [ ] All 6 assertions use `assert.match(body, /regex/)` static pattern
- [ ] `npm test` runs the new test without skipping

---

## Task 3: Sync to `.cycle/scripts/verify.sh` and verify test suite

### Overview
Run `npm run sync-defaults` to mirror `src/defaults/scripts/verify.sh` → `.cycle/scripts/verify.sh`, then run `npm test` to confirm all 434+ tests pass including the new assertions.

### Changes Required
**Command**: `npm run sync-defaults`
- Both files were byte-identical before Task 1, so no divergence guard triggers. Clean sync.
- `.cycle/.sync-state.json` updated with new sha256 for `verify.sh`.

**Command**: `npm test`
- Runs pretest (build), then full suite.
- New test `"verify.sh has source-mutation guard"` must pass.
- All existing 434 tests must pass.
- TypeScript coverage gate (`src/engine/triage.ts ≥ 95%`) unaffected (no TS changes).

### Success Criteria
- [ ] `diff src/defaults/scripts/verify.sh .cycle/scripts/verify.sh` exits 0 (byte-identical)
- [ ] `npm test` exits 0
- [ ] Output shows new test passing
- [ ] No TypeScript compiler warnings (`npm run typecheck` exits 0)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] verify.sh exits 1 with a stderr message when git diff --name-only $BASE...HEAD produces only docs/cycle/-prefixed paths.` | Task 1 | `grep -qv '^docs/cycle/'` exits 1 with no match when all paths are under `docs/cycle/`; `exit 1` + `>&2` message fires |
| `[ ] verify.sh exits 1 with the same message when git diff --name-only $BASE...HEAD produces no paths at all.` | Task 1 | Same `grep -qv` exits 1 on empty input (no lines to match); same guard block fires |
| `[ ] verify.sh exits 0 and continues to the test-runner block when at least one non-docs/cycle/ path is changed.` | Task 1 | `grep -qv` exits 0 when any non-`docs/cycle/` path present; `if !` is false; script falls through to dispatch block |
| `[ ] The guard uses BASE="${CYCLE_BASE:-master}" for the ref.` | Task 1 | Exact form specified in implementation |
| `[ ] The stderr message contains the text "no src changes" and names the base ref.` | Task 1 | Message: `"verify: no src changes outside docs/cycle/ relative to $BASE"` — contains `no src changes`, references `$BASE` |
| `[ ] tests/defaults/scripts.test.ts has at least two new assertions: one that the guard pattern is present, one that CYCLE_BASE fallback is present.` | Task 2 | New test has 6 assertions; first two cover `/git diff --name-only/` and `/CYCLE_BASE:-master/` |
| `[ ] npm test passes on master after the change.` | Task 3 | Full suite run confirms |
| `[ ] No compiler/linter warnings introduced.` | Task 3 | `npm run typecheck` + `npm test` (pretest builds) confirm |

---

## Testing Strategy

### Unit Tests
- **Static source-text assertions** (`tests/defaults/scripts.test.ts`): read `src/defaults/scripts/verify.sh` as UTF-8 string, assert 6 regex patterns present. No bash execution, no tmp repos. Follows established pattern from existing `"verify.sh installs deps"` test.
- Patterns tested: `/git diff --name-only/`, `/CYCLE_BASE:-master/`, `/docs\/cycle\//`, `/>&2/`, `/exit 1/`, `/no src changes/`.
- No mocking required — pure string assertions on a file read.

### Integration / E2E Tests
- Not added in this cycle (out of scope per SPEC). The static assertions are sufficient to verify the guard is present with correct structure.
- The guard's runtime behavior is implicitly covered by the cycle engine's own future runs after this ships.

## Risk Assessment
- **`set -e` + empty diff interaction**: Mitigated by using `if !` condition which suppresses `set -e` for the entire pipeline expression. `grep -qv` on empty input exits 1 cleanly.
- **Sync divergence guard blocking**: Both files are currently byte-identical; `sync-defaults` will detect no divergence and copy cleanly. Low risk.
- **CYCLE_BASE not set in standalone invocation**: The `:-master` fallback handles this. The engine always supplies `CYCLE_BASE`, so engine-driven runs are unaffected by the fallback value.
- **Guard rejects valid cycles with only doc changes**: Intentional behavior — any legitimate cycle must touch source. If a future cycle is legitimately docs-only (e.g., a README-only fix), this guard would need an escape hatch. Out of scope for this cycle.
```
