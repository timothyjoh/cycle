# Implementation Plan: Cycle 0255

## Overview

Create `src/engine/rate-limit.ts` — a pure utility module exporting `ExecResult` interface and `isRateLimitError` function — with full test coverage, a 100% per-file coverage floor, and CLAUDE.md documentation.

## Current State (from Research)

- No `src/engine/rate-limit.ts` exists.
- Canonical pure utility pattern: no imports, named exports only, no default export. See `src/engine/path-utils.ts` and `src/engine/log-fmt.ts`.
- Test pattern: flat `test()` calls in `tests/engine/<module>.test.ts`, `node:test` + `node:assert/strict`, no mocking needed for pure functions.
- `scripts/coverage-gate.mjs` `FLOORS` table at lines 12–31; currently ends with `"src/engine/reflection.ts": 95`.
- CLAUDE.md Architecture section lists pure utility modules as backtick-quoted one-liners with em-dash descriptions.
- `verbatimModuleSyntax: true` in `tsconfig.json` — type-only imports require `import type`.
- Existing exec modules collapse `null` exit codes to `-1` via `code ?? -1`; `ExecResult` uses `number | null` deliberately to cover the broader subprocess contract in tests.

## Desired End State

- `src/engine/rate-limit.ts` exports `ExecResult` and `isRateLimitError`.
- `tests/engine/rate-limit.test.ts` covers all 8 cases from SPEC testing strategy.
- `scripts/coverage-gate.mjs` FLOORS includes `"src/engine/rate-limit.ts": 100`.
- CLAUDE.md Architecture section lists `src/engine/rate-limit.ts`.
- `npm run typecheck` passes. `npm test` passes. `npm run test:coverage` passes all per-file floors.

## What We're NOT Doing

- No wiring of `isRateLimitError` into any existing exec module (`exec-claudecode`, `exec-codex`, `exec-gemini`, etc.).
- No retry or backoff logic.
- No changes to engine supervisor, queue drain loop, or `exec.ts` REGISTRY.
- No new structural invariant in `scripts/structural-invariants.mjs`.
- No changes to `StepResult` type or any existing type.

## Implementation Approach

Three sequential changes: (1) create the source file, (2) create the test file, (3) register the coverage floor. Documentation update (CLAUDE.md) runs alongside Task 3. The implementation logic uses `exitCode === 429` as the primary fast path, then guards on `exitCode !== 1` for the pattern-match path, then substring-matches `(stderr + stdout).toLowerCase()` against the three patterns — identical in structure to the existing case-insensitive check in `src/engine/triage.ts:122`.

---

## Task 1: Create `src/engine/rate-limit.ts`

### Overview

Pure utility module with `ExecResult` interface and `isRateLimitError` function. No imports. Named exports only.

### Changes Required

**File**: `src/engine/rate-limit.ts` (new file)

```typescript
const RATE_LIMIT_PATTERNS = ["rate limit", "429", "too many requests"];

export interface ExecResult {
  exitCode: number | null;
  stderr: string;
  stdout: string;
}

export function isRateLimitError(result: ExecResult): boolean {
  if (result.exitCode === 429) return true;
  if (result.exitCode !== 1) return false;
  const combined = (result.stderr + result.stdout).toLowerCase();
  return RATE_LIMIT_PATTERNS.some((p) => combined.includes(p));
}
```

Logic rationale:
- `exitCode === 429` → true immediately; SPEC says "regardless of stderr/stdout content".
- `exitCode !== 1` early return covers: `null` (killed process), `0` (success), any other non-429 code.
- Concatenate `stderr + stdout` then `toLowerCase()` once; `RATE_LIMIT_PATTERNS` stores lowercase literals so no per-pattern lowercasing needed.
- `some()` stops at first match — correct for the OR semantics SPEC requires.

### Success Criteria

- [ ] `npm run typecheck` passes with no new errors
- [ ] File has no imports
- [ ] Both `ExecResult` and `isRateLimitError` are named exports (no default export)

---

## Task 2: Create `tests/engine/rate-limit.test.ts`

### Overview

Unit test file covering all 8 cases from SPEC testing strategy. Flat `test()` structure matching `tests/engine/path-utils.test.ts` conventions.

### Changes Required

**File**: `tests/engine/rate-limit.test.ts` (new file)

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRateLimitError } from "../../src/engine/rate-limit.ts";

test("isRateLimitError — exit 429 returns true regardless of output", () => {
  assert.equal(isRateLimitError({ exitCode: 429, stderr: "", stdout: "" }), true);
});

test("isRateLimitError — exit 1 + 'rate limit' in stderr returns true", () => {
  assert.equal(isRateLimitError({ exitCode: 1, stderr: "rate limit exceeded", stdout: "" }), true);
});

test("isRateLimitError — exit 1 + '429' in stderr returns true", () => {
  assert.equal(isRateLimitError({ exitCode: 1, stderr: "429 error", stdout: "" }), true);
});

test("isRateLimitError — exit 1 + 'Too Many Requests' in stderr returns true", () => {
  assert.equal(isRateLimitError({ exitCode: 1, stderr: "Too Many Requests", stdout: "" }), true);
});

test("isRateLimitError — exit 1 + pattern in stdout returns true", () => {
  assert.equal(isRateLimitError({ exitCode: 1, stderr: "", stdout: "rate limit reached" }), true);
});

test("isRateLimitError — exit 1 + unrelated stderr returns false", () => {
  assert.equal(isRateLimitError({ exitCode: 1, stderr: "command not found", stdout: "" }), false);
});

test("isRateLimitError — exit 0 + matching string returns false", () => {
  assert.equal(isRateLimitError({ exitCode: 0, stderr: "rate limit", stdout: "" }), false);
});

test("isRateLimitError — null exit code + matching string returns false", () => {
  assert.equal(isRateLimitError({ exitCode: null, stderr: "rate limit", stdout: "" }), false);
});
```

### Success Criteria

- [ ] `npm test` passes with all 8 new tests green
- [ ] All existing tests remain green
- [ ] Each SPEC acceptance criterion test case is represented by exactly one `test()` block

---

## Task 3: Register Coverage Floor and Update CLAUDE.md

### Overview

Two housekeeping changes required before `npm run test:coverage` will pass: add the coverage floor entry, and document the new module in CLAUDE.md.

### Changes Required

**File**: `scripts/coverage-gate.mjs`

Add one entry to the `FLOORS` object after line 30 (`"src/engine/reflection.ts": 95`):

```javascript
  "src/engine/rate-limit.ts": 100,
```

Resulting block end:
```javascript
  "src/engine/reflection.ts": 95,
  "src/engine/rate-limit.ts": 100,
};
```

**File**: `CLAUDE.md`

In the Architecture section, after the `src/engine/log-fmt.ts` bullet (line ~65), add:

```
`src/engine/rate-limit.ts` — `isRateLimitError(result)` pure helper; returns `true` on exit 429 or exit 1 with rate-limit signal in stderr/stdout.
```

### Success Criteria

- [ ] `npm run test:coverage` exits 0 (floor met, no LCOV-missing exit 2)
- [ ] `npm run check:coverage` exits 0
- [ ] `CLAUDE.md` Architecture section lists `src/engine/rate-limit.ts` with em-dash description matching existing module format

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/engine/rate-limit.ts` exists and exports both `ExecResult` and `isRateLimitError` | Task 1 | |
| `[ ] isRateLimitError({ exitCode: 429, stderr: "", stdout: "" })` returns `true` | Task 2 | "exit 429 returns true regardless of output" test |
| `[ ] isRateLimitError({ exitCode: 1, stderr: "rate limit exceeded", stdout: "" })` returns `true` | Task 2 | "exit 1 + 'rate limit' in stderr" test |
| `[ ] isRateLimitError({ exitCode: 1, stderr: "429 error", stdout: "" })` returns `true` | Task 2 | "exit 1 + '429' in stderr" test |
| `[ ] isRateLimitError({ exitCode: 1, stderr: "Too Many Requests", stdout: "" })` returns `true` | Task 2 | "exit 1 + 'Too Many Requests' in stderr" test |
| `[ ] isRateLimitError({ exitCode: 1, stderr: "command not found", stdout: "" })` returns `false` | Task 2 | "exit 1 + unrelated stderr returns false" test |
| `[ ] isRateLimitError({ exitCode: 0, stderr: "rate limit", stdout: "" })` returns `false` | Task 2 | "exit 0 + matching string returns false" test |
| `[ ] isRateLimitError` detects patterns in `stdout` as well as `stderr` for exit code 1 | Task 2 | "exit 1 + pattern in stdout returns true" test |
| `[ ] tests/engine/rate-limit.test.ts` covers all cases above | Task 2 | |
| `[ ] npm run typecheck` passes with no new errors | Task 1 | verified after Task 1 complete |
| `[ ] npm test` passes with all existing tests still green | Task 2 | verified after Task 2 complete |
| `[ ] Per-file coverage floor for src/engine/rate-limit.ts` added to `scripts/coverage-gate.mjs` at 100% | Task 3 | |

---

## Testing Strategy

### Unit Tests

All tests in `tests/engine/rate-limit.test.ts`. Pure function — no mocking needed.

Cases:
- Exit 429, empty output → `true` (primary fast path)
- Exit 1, stderr = `"rate limit exceeded"` → `true` (pattern 1, case variant)
- Exit 1, stderr = `"429 error"` → `true` (pattern 2 as substring in text)
- Exit 1, stderr = `"Too Many Requests"` → `true` (pattern 3, mixed case; `toLowerCase()` handles it)
- Exit 1, stdout = `"rate limit reached"`, stderr empty → `true` (stdout path)
- Exit 1, stderr = `"command not found"` → `false` (unrelated error)
- Exit 0, stderr = `"rate limit"` → `false` (success code guard)
- Exit `null`, stderr = `"rate limit"` → `false` (null guard via `exitCode !== 1`)

No mocking required. No filesystem or subprocess dependency. No `describe` nesting.

### Integration / E2E Tests

None required. The function is pure; integration behavior (being called from exec modules) is explicitly out of scope for this cycle.

## Risk Assessment

- **Coverage gate exit 2 (missing LCOV block)**: if `src/engine/rate-limit.ts` is not imported by any production code path exercised during coverage run, the LCOV file may lack a block for it. Mitigation: Node test runner with `--experimental-test-coverage` instruments all files matching the source glob, not just those reachable from production entry points — the test file's direct import of `rate-limit.ts` is sufficient to generate an LCOV block.
- **`verbatimModuleSyntax` violation**: `ExecResult` is used as a value-position type only; no `import type` needed in the source file since it defines (not imports) the interface. Mitigation: Task 1 source has no imports at all, so no risk.
- **Pattern collision**: the string `"429"` appears in exit code 429's numeric representation but the pattern check only applies when `exitCode === 1`; the early `exitCode === 429` guard fires first. No collision possible.
