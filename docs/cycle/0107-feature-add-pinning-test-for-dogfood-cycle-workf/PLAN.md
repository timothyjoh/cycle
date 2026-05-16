All context confirmed. Resolving open questions: (1) `reflection` absent → skip that assertion entirely, (2) mirror reference file → use async `readFile`, (3) CWD confirmed safe for relative paths.

```markdown
# Implementation Plan: Cycle 0107

## Overview
Create `tests/dogfood/feature-yaml.test.ts` — a pinning test that reads `.cycle/workflows.yml`, asserts the feature workflow's full step sequence via `deepEqual`, and asserts the three trunk-based divergence invariants that distinguish it from `src/defaults`.

## Current State (from Research)
- `.cycle/workflows.yml` feature workflow: 8 steps (`spec, research, plan, build, review, fix, verify, commit`), `no_branch: true`, commit step references `scripts/commit-trunk.sh`, no `pr` step, no `reflection` step.
- `tests/defaults/feature-yaml.test.ts` is the reference mirror: async `readFile`, `YAML.parse`, `find` by `name`, `deepEqual` on step names, flat `test()` blocks, no mocking.
- `tests/dogfood/` directory does not exist.
- `yaml` package already installed; `tsconfig.json` already includes `tests/**/*.ts`; `--test` runner auto-discovers `**/*.test.ts`.

## Desired End State
- `tests/dogfood/feature-yaml.test.ts` exists with two `test()` blocks.
- `npm test` discovers and runs the new file with zero failures.
- Any future `npm run sync-defaults` that overwrites `.cycle/workflows.yml` will cause the divergence-invariant test to fail, catching the regression.

## What We're NOT Doing
- Not modifying `.cycle/workflows.yml` or `src/defaults/workflows.yml`.
- Not touching any existing test file.
- Not testing any workflow other than `feature` within `.cycle/workflows.yml`.
- Not asserting `reflection` ordering (step is absent; SPEC conditional evaluates false).
- Not extracting shared test helpers (SPEC is silent on this; out of scope).

## Implementation Approach
Single-task cycle: create one new test file. No `src/` changes. No coverage impact (tests excluded from measurement). Mirror `tests/defaults/feature-yaml.test.ts` exactly except: use `.cycle/workflows.yml` path, two `test()` blocks instead of one, and add divergence-invariant assertions in the second block.

---

## Task 1: Create `tests/dogfood/feature-yaml.test.ts`

### Overview
Write the pinning test file with two `test()` blocks: (1) full step-sequence deepEqual guard, (2) trunk-based divergence invariants.

### Changes Required

**File**: `tests/dogfood/feature-yaml.test.ts` *(new file — directory must be created)*

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

test("dogfood feature workflow has expected step sequence", async () => {
  const y = YAML.parse(await readFile(".cycle/workflows.yml", "utf8"));
  const feature = y.workflows.find((w: { name: string }) => w.name === "feature");
  assert.ok(feature, "workflows.yml should contain a feature workflow");
  const names = feature.steps.map((s: { name: string }) => s.name);
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "commit"]);
  assert.equal(feature.steps.length, 8, "regression guard: step count should be 8");
});

test("dogfood feature workflow has trunk-based divergence invariants", async () => {
  const y = YAML.parse(await readFile(".cycle/workflows.yml", "utf8"));
  const feature = y.workflows.find((w: { name: string }) => w.name === "feature");
  assert.ok(feature, "workflows.yml should contain a feature workflow");
  assert.equal(feature.no_branch, true, "dogfood feature workflow must have no_branch: true");
  const hasTrunkCommit = feature.steps.some(
    (s: { command?: string }) => s.command?.includes("commit-trunk.sh")
  );
  assert.ok(hasTrunkCommit, "feature workflow must have a step referencing commit-trunk.sh");
  const hasPr = feature.steps.some((s: { name: string }) => s.name === "pr");
  assert.ok(!hasPr, "dogfood feature workflow must not have a pr step");
});
```

**Note on `reflection` assertion**: `.cycle/workflows.yml` has no `reflection` step as of implementation time (8 steps confirmed). SPEC conditional evaluates false — the `indexOf("reflection") < indexOf("commit")` assertion is omitted per spec.

**Note on `readFile` vs `readFileSync`**: Reference file (`tests/defaults/feature-yaml.test.ts`) uses async `readFile`. SPEC's mirror-exactly instruction takes precedence over the `fs.readFileSync` mention in Requirements.

### Success Criteria
- [ ] `tests/dogfood/feature-yaml.test.ts` exists
- [ ] `npm test` runs both new `test()` blocks with zero failures
- [ ] `npm run typecheck` exits 0 (no TS errors or warnings)
- [ ] All 434+ existing tests still pass
- [ ] Coverage does not regress (new file is test-only, excluded from measurement)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`tests/dogfood/feature-yaml.test.ts\` exists and is picked up by \`npm test\`.` | Task 1 | New file auto-discovered by `node --test` glob |
| `[ ] Test pins the complete feature workflow step sequence (deepEqual guard).` | Task 1 | First `test()` block, `assert.deepEqual(names, [...8 steps...])` |
| `[ ] Test asserts \`no_branch: true\` on the dogfood feature workflow.` | Task 1 | Second `test()` block, `assert.equal(feature.no_branch, true, ...)` |
| `[ ] Test asserts a step referencing \`commit-trunk.sh\` is present.` | Task 1 | Second `test()` block, `Array.some` on `s.command?.includes(...)` |
| `[ ] Test asserts no step named \`pr\` exists in the feature workflow.` | Task 1 | Second `test()` block, `assert.ok(!hasPr, ...)` |
| `[ ] If \`reflection\` step is present: test asserts its index is less than the index of \`commit\`.` | WAIVED — `reflection` step absent from `.cycle/workflows.yml` at implementation time; SPEC conditional evaluates false |
| `[ ] All existing tests still pass.` | Task 1 | Verified by `npm test` full suite run |
| `[ ] No compiler/linter warnings introduced.` | Task 1 | Verified by `npm run typecheck` |
| `[ ] Coverage does not regress (line ≥ 95%, branch ≥ 75%, function ≥ 90%).` | Task 1 | Test files excluded from coverage measurement; no `src/` changes |

---

## Testing Strategy

### Unit Tests
- Two `test()` blocks in `tests/dogfood/feature-yaml.test.ts` cover all assertions.
- No mocking — reads real `.cycle/workflows.yml` from CWD (repo root, confirmed by reference test pattern).
- Key edge cases: `feature` workflow found by `name` field (fails loudly if missing); step count pinned by both `deepEqual` and `assert.equal`.

### Integration / E2E Tests
- `npm test` serves as integration verification: runs full 434+ test suite including new file, confirms no regressions.

## Risk Assessment
- **`tests/dogfood/` directory missing**: `mkdir -p` before writing the file; no risk.
- **CWD mismatch**: Confirmed safe — `node --test` runs from repo root; `.cycle/workflows.yml` relative path resolves identically to how `src/defaults/workflows.yml` resolves in the reference test.
- **Type errors on YAML step shape**: Inline type annotations on lambda params (same pattern as reference file) prevent implicit-any errors without needing a separate interface.
```
