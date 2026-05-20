Enough context. Writing PLAN.md now.

```markdown
# Implementation Plan: Cycle 0199

## Overview
Create `src/engine/path-utils.ts` exporting a single `isDenied(p: string): boolean` helper, then wire both callsites (`commit-cycle.ts` and `run-cycle.ts`) to import it, deleting their independent local implementations.

## Current State (from Research)

- `src/engine/commit-cycle.ts` lines 14–25: defines `DENYLIST_PREFIXES`, `DENYLIST_EXACT`, and a module-private `isDenied(p)`.
- `src/engine/run-cycle.ts` lines 34–45: defines `DOC_APPEND_DENYLIST_PREFIXES`, `DOC_APPEND_DENYLIST_EXACT`, and a module-private `isDocAppendDenied(p)` — byte-for-byte the same algorithm.
- `src/engine/path-utils.ts` does not exist.
- No existing unit tests target the denylist logic directly; coverage comes only through `scopeGuard` and `appendDocumentationPaths` integration tests.
- `scripts/coverage-gate.mjs` has a `FLOORS` table; `src/engine/commit-cycle.ts` is at 95%. `path-utils.ts` will need its own floor entry.

## Desired End State

- `src/engine/path-utils.ts` exports `isDenied(p: string): boolean` with the unified prefix list, exact-match set, and `.lock` suffix check.
- `commit-cycle.ts` imports `isDenied` from `../engine/path-utils.ts` (relative) — local constants and function deleted.
- `run-cycle.ts` imports `isDenied` from `./path-utils.ts` — local constants and `isDocAppendDenied` function deleted; all three call-sites changed from `isDocAppendDenied(p)` to `isDenied(p)`.
- `tests/engine/path-utils.test.ts` covers: prefix match (exact), prefix match (child), exact-match set, `.lock` suffix, and passing paths.
- `scripts/coverage-gate.mjs` FLOORS entry: `"src/engine/path-utils.ts": 100`.
- `npm test`, `npm run typecheck`, `npm run test:coverage`, `npm run check:coverage` all pass with no regressions.

## What We're NOT Doing

- Not adding any new denylist entries (no `package-lock.json`, no new prefixes).
- Not changing the logic — identical behaviour at both callsites.
- Not touching the structural-invariants script (this is not an agent or exec module).
- Not updating ENGINE.md or ARCHITECTURE.md (internal refactor, no externally visible behaviour change).
- Not renaming the exported symbol at callsites beyond what's necessary (`isDocAppendDenied` → `isDenied`).

## Implementation Approach

Three files change, one new file is created, and one coverage-floor entry is added. Tasks are ordered: create the shared module first, then update callsites, then add tests, then register the coverage floor. No mocking needed — `isDenied` is a pure function; unit tests call it directly.

---

## Task 1: Create `src/engine/path-utils.ts`

### Overview
New file exporting the unified `isDenied` helper. Merges the two identical implementations into one authoritative source.

### Changes Required
**File**: `src/engine/path-utils.ts` *(new)*
```ts
const DENYLIST_PREFIXES = [".claude", "dist", "node_modules"];
const DENYLIST_EXACT = [".cycle/cycle.pid"];

export function isDenied(p: string): boolean {
  const q = p.replace(/\/$/, "");
  for (const prefix of DENYLIST_PREFIXES) {
    if (q === prefix || q.startsWith(prefix + "/")) return true;
  }
  if (DENYLIST_EXACT.includes(q)) return true;
  if (q.endsWith(".lock")) return true;
  return false;
}
```

### Success Criteria
- [ ] File exists at `src/engine/path-utils.ts`
- [ ] `npm run typecheck` passes

---

## Task 2: Wire `commit-cycle.ts` to `path-utils.ts`

### Overview
Delete the three local lines (`DENYLIST_PREFIXES`, `DENYLIST_EXACT`, `isDenied`) and add one import.

### Changes Required
**File**: `src/engine/commit-cycle.ts`

Remove lines 14–25:
```ts
const DENYLIST_PREFIXES = [".claude", "dist", "node_modules"];
const DENYLIST_EXACT = [".cycle/cycle.pid"];

function isDenied(p: string): boolean {
  const q = p.replace(/\/$/, "");
  for (const prefix of DENYLIST_PREFIXES) {
    if (q === prefix || q.startsWith(prefix + "/")) return true;
  }
  if (DENYLIST_EXACT.includes(q)) return true;
  if (q.endsWith(".lock")) return true;
  return false;
}
```

Add to imports (top of file, after existing imports):
```ts
import { isDenied } from "./path-utils.ts";
```

The two `isDenied(p)` call-sites at lines 77 and 125 remain unchanged (same name).

### Success Criteria
- [ ] No local `DENYLIST_PREFIXES`, `DENYLIST_EXACT`, or `isDenied` definition remains in `commit-cycle.ts`
- [ ] `npm run typecheck` passes
- [ ] All existing `scopeGuard` and `commitCycle` tests pass

---

## Task 3: Wire `run-cycle.ts` to `path-utils.ts`

### Overview
Delete the three local lines (`DOC_APPEND_DENYLIST_PREFIXES`, `DOC_APPEND_DENYLIST_EXACT`, `isDocAppendDenied`) and rename all call-sites to `isDenied`.

### Changes Required
**File**: `src/engine/run-cycle.ts`

Remove lines 34–45:
```ts
const DOC_APPEND_DENYLIST_PREFIXES = [".claude", "dist", "node_modules"];
const DOC_APPEND_DENYLIST_EXACT = [".cycle/cycle.pid"];

function isDocAppendDenied(p: string): boolean {
  const q = p.replace(/\/$/, "");
  for (const prefix of DOC_APPEND_DENYLIST_PREFIXES) {
    if (q === prefix || q.startsWith(prefix + "/")) return true;
  }
  if (DOC_APPEND_DENYLIST_EXACT.includes(q)) return true;
  if (q.endsWith(".lock")) return true;
  return false;
}
```

Add to imports (top of file, after existing imports):
```ts
import { isDenied } from "./path-utils.ts";
```

Rename all `isDocAppendDenied(p)` call-sites to `isDenied(p)` — there is one call-site inside `appendDocumentationPaths`.

### Success Criteria
- [ ] No local `DOC_APPEND_DENYLIST_PREFIXES`, `DOC_APPEND_DENYLIST_EXACT`, or `isDocAppendDenied` definition remains in `run-cycle.ts`
- [ ] `npm run typecheck` passes
- [ ] All existing `run-cycle.documentation` tests pass

---

## Task 4: Add unit tests for `path-utils.ts`

### Overview
New test file covering all three denylist branches directly against the exported `isDenied` function.

### Changes Required
**File**: `tests/engine/path-utils.test.ts` *(new)*

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDenied } from "../../src/engine/path-utils.ts";

test("isDenied — prefix exact match", () => {
  assert.equal(isDenied(".claude"), true);
  assert.equal(isDenied("dist"), true);
  assert.equal(isDenied("node_modules"), true);
});

test("isDenied — prefix child match", () => {
  assert.equal(isDenied(".claude/settings.json"), true);
  assert.equal(isDenied("dist/cycle.js"), true);
  assert.equal(isDenied("node_modules/foo/bar.js"), true);
});

test("isDenied — prefix trailing slash normalised", () => {
  assert.equal(isDenied("dist/"), true);
});

test("isDenied — exact match set", () => {
  assert.equal(isDenied(".cycle/cycle.pid"), true);
});

test("isDenied — .lock suffix", () => {
  assert.equal(isDenied("package-lock.json"), false); // does not end with .lock
  assert.equal(isDenied(".claude/scheduled_tasks.lock"), true);
  assert.equal(isDenied("yarn.lock"), true);
});

test("isDenied — allowed paths pass through", () => {
  assert.equal(isDenied("src/engine/run-cycle.ts"), false);
  assert.equal(isDenied("scripts/coverage-gate.mjs"), false);
  assert.equal(isDenied("docs/cycle/0199-feature-foo/BUILD.md"), false);
  assert.equal(isDenied("README.md"), false);
});
```

### Success Criteria
- [ ] `npm test` passes including new path-utils tests
- [ ] All path-utils test cases execute

---

## Task 5: Add coverage floor for `path-utils.ts`

### Overview
Register `src/engine/path-utils.ts` in the FLOORS table at 100% (pure function, full branch coverage achievable in Task 4 tests).

### Changes Required
**File**: `scripts/coverage-gate.mjs`

In the `FLOORS` object, add:
```js
"src/engine/path-utils.ts": 100,
```

### Success Criteria
- [ ] `npm run test:coverage && npm run check:coverage` passes
- [ ] Coverage for `path-utils.ts` meets or exceeds 100% line coverage

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/engine/path-utils.ts` exists and exports `isDenied(p: string): boolean` with the unified prefix list, exact-match set, and `.lock` suffix check | Task 1 | |
| `[ ] commit-cycle.ts` imports and uses `isDenied` from `path-utils.ts`; local `isDenied` definition removed | Task 2 | |
| `[ ] run-cycle.ts` imports and uses `isDenied` from `path-utils.ts`; local `isDocAppendDenied` definition and all call sites updated | Task 3 | |
| `[ ] No local denylist implementations remain in either file` | Tasks 2 & 3 | Verified by absence of DENYLIST_PREFIXES/DENYLIST_EXACT constants |
| `[ ] All existing scope-guard and documentation-path-filter tests pass unchanged` | Tasks 2 & 3 | No test changes required — same behaviour |
| `[ ] src/engine/path-utils.ts` has its own unit tests covering prefix match, exact match, and `.lock` suffix check | Task 4 | |
| `[ ] npm run typecheck` passes with no new errors | Tasks 1–3 | Checked after each task |
| `[ ] Coverage does not drop (line ≥ 95%, branch ≥ 75%, function ≥ 90%)` | Task 5 | Floor added at 100% for path-utils.ts |

---

## Testing Strategy

### Unit Tests
- `tests/engine/path-utils.test.ts`: pure function, no mocking needed. Covers all three branches: prefix (exact and child), exact-match set, `.lock` suffix, and passing paths. Trailing-slash normalisation tested explicitly.

### Integration / E2E Tests
- Existing `tests/engine/commit-cycle.test.ts` `scopeGuard` and `commitCycle` tests exercise `isDenied` through the real import path — no changes needed.
- Existing `tests/engine/run-cycle.documentation.test.ts` exercises `isDenied` (formerly `isDocAppendDenied`) through `appendDocumentationPaths` — no changes needed.

## Risk Assessment
- **Name collision**: `commit-cycle.ts` already has a local `isDenied` with the same name as the import — deletion must precede or coincide with import addition to avoid a redeclaration error. TypeScript will catch this at `typecheck` time.
- **`package-lock.json` false-negative**: The test makes explicit that `package-lock.json` does NOT match `.lock` suffix (it ends with `.json`). This is existing behaviour, preserved exactly.
```

<output above written to stdout as PLAN.md content>

`★ Insight ─────────────────────────────────────`
Both local implementations use identical algorithm but different constant names (`DENYLIST_*` vs `DOC_APPEND_DENYLIST_*`). The name divergence is the silent footgun — same logic, but the naming implies they *could* differ, making future readers uncertain whether they're safe to change one without the other.

The `.lock` suffix check catches `yarn.lock`/`scheduled_tasks.lock` but NOT `package-lock.json` — this is intentional (`.json` extension wins). The plan makes this explicit in a test so it doesn't get "fixed" accidentally.
`─────────────────────────────────────────────────`
