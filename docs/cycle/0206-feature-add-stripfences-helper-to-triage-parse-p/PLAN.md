I have everything needed. Resolving the two open questions from RESEARCH before writing:

1. **Placement**: `log-fmt.ts` — `stripFences` is a pure `string→string` utility, identical shape to `truncateHeadCapped`. Already imported in `triage.ts`, so no new import line — just extend the named import. Out-of-scope clause prevents _use_ in other steps, not _placement_ in the shared util module.

2. **Export + test strategy**: Export from `log-fmt.ts` → test directly in `tests/engine/log-fmt.test.ts` (or a new sibling). Also exercise via `validateOutput` round-trip to cover the integration path.

3. **Regex**: handle `\r\n` and `\n`; no `~~~` support needed (LLM outputs use backtick fences exclusively per failure data).

# Implementation Plan: Cycle 0206

## Overview
Add a `stripFences(s: string): string` pure helper to `src/engine/log-fmt.ts` and apply it unconditionally before `JSON.parse` in `validateOutput` (`src/engine/triage.ts:394`). This eliminates the dominant parse-failure class (76% of observed triage failures) without touching retry policy, error categorization, or any other step.

## Current State (from Research)
- `validateOutput` at `triage.ts:385` calls `JSON.parse(rawStdout)` directly at line 394 with no pre-processing.
- `log-fmt.ts` is a 3-line file exporting only `truncateHeadCapped` — a pure `string→string` helper already imported in `triage.ts:20`.
- `tests/engine/triage-validator.test.ts` has dense `validateOutput` coverage; line 50–52 exercises the parse-failure path.
- `scripts/coverage-gate.mjs:13` enforces `"src/engine/triage.ts": 95` per-file floor.
- Cycle 0205 already shipped the prompt-level no-fences instruction; this adds the deterministic code-side fallback.

## Desired End State
- `log-fmt.ts` exports `stripFences(s: string): string`.
- `triage.ts:394` calls `JSON.parse(stripFences(rawStdout))`.
- Unit tests in `tests/engine/log-fmt.test.ts` (new file) cover all four SPEC cases for `stripFences` directly.
- `validateOutput` round-trip test added to `triage-validator.test.ts` for fenced input.
- `docs/ENGINE.md` has a one-line note in the triage section.
- `npm test`, `npm run typecheck`, and `npm run check:coverage` all pass.

## What We're NOT Doing
- Applying fence-stripping to reflection, spec, or any other step.
- Changing retry policy or error categorization logic.
- Removing the cycle 0205 prompt-level no-fences instruction.
- Handling `~~~` fence syntax.
- Modifying `sync-defaults` or any prompt file.

## Implementation Approach
Two-file change plus a new test file. `stripFences` goes in `log-fmt.ts` (pure utility module, consistent with `truncateHeadCapped`). The call site change in `triage.ts` is one line. Tests are split: direct unit tests for `stripFences` in a new `log-fmt.test.ts`, plus one `validateOutput` round-trip in the existing `triage-validator.test.ts` to verify the integration path.

---

## Task 1: Add `stripFences` to `log-fmt.ts` and wire into `triage.ts`

### Overview
Add the helper function and apply it at the parse call site.

### Changes Required

**File**: `src/engine/log-fmt.ts`

Add export after `truncateHeadCapped`:

```typescript
export function stripFences(s: string): string {
  const m = s.trim().match(/^```(?:json)?\r?\n([\s\S]*?)\r?\n```$/);
  return m ? m[1] : s;
}
```

Behavior:
- `s.trim()` handles leading/trailing whitespace around the fence block.
- `(?:json)?` matches both ` ```json ` and bare ` ``` ` openers.
- `\r?\n` handles both `\r\n` and `\n` line endings.
- Returns `match[1]` (inner content) if fenced, original `s` if not (exact identity).

---

**File**: `src/engine/triage.ts`

Line 20 — extend named import:
```typescript
// before
import { truncateHeadCapped } from './log-fmt.ts';
// after
import { truncateHeadCapped, stripFences } from './log-fmt.ts';
```

Line 394 — apply strip before parse:
```typescript
// before
parsed = JSON.parse(rawStdout);
// after
parsed = JSON.parse(stripFences(rawStdout));
```

### Success Criteria
- [ ] `log-fmt.ts` exports `stripFences`
- [ ] `triage.ts` import includes `stripFences`
- [ ] `triage.ts:394` uses `stripFences(rawStdout)` before `JSON.parse`
- [ ] `npm run typecheck` passes with no warnings

---

## Task 2: Unit tests for `stripFences` and `validateOutput` round-trip

### Overview
Direct unit tests for all four SPEC cases plus an integration round-trip.

### Changes Required

**File**: `tests/engine/log-fmt.test.ts` _(new file)_

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { stripFences } from "../../src/engine/log-fmt.ts";

test("stripFences: no-fence passthrough is exact identity", () => {
  const s = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences(s), s);
});

test("stripFences: strips ```json opener and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```json\n" + inner + "\n```"), inner);
});

test("stripFences: strips bare ``` opener and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```\n" + inner + "\n```"), inner);
});

test("stripFences: handles leading/trailing whitespace around fence block", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("  ```json\n" + inner + "\n```  "), inner);
});

test("stripFences: handles CRLF line endings", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```json\r\n" + inner + "\r\n```"), inner);
});
```

**File**: `tests/engine/triage-validator.test.ts`

Add one integration test after existing tests (exact insertion point: after the last `test(...)` block in the file):

```typescript
test("validateOutput: recovers fenced JSON output", () => {
  // mirrors refl-0205 observed failure mode: triage agent wraps JSON in ```json
  const inner = buildMinimalValidOutput(); // use existing helper or inline a minimal valid payload
  const fenced = "```json\n" + JSON.stringify(inner) + "\n```";
  const r = validateOutput(fenced, [], [], minimalCfg, new Set());
  assert.equal(r.ok, true);
});
```

_Note: inspect the test file to use its existing minimal-output builder or inline a valid `TriageOutput` literal — the exact helper name is confirmed in Task 2 verification._

### Success Criteria
- [ ] `tests/engine/log-fmt.test.ts` created with 5 test cases
- [ ] All 5 `stripFences` tests pass
- [ ] `validateOutput` fenced-input round-trip test passes
- [ ] `npm run test:coverage` passes with triage.ts at ≥ 95% line coverage
- [ ] `npm run check:coverage` passes

---

## Task 3: `docs/ENGINE.md` one-line note

### Overview
Document the code-side fence strip in the triage section per SPEC.

### Changes Required

**File**: `docs/ENGINE.md`

Locate the triage section. After the existing description of the prompt-level no-fences instruction (cycle 0205), add:

> Code-side: `stripFences(rawStdout)` is applied unconditionally before `JSON.parse` in `validateOutput` as a deterministic fallback to the prompt-level instruction.

### Success Criteria
- [ ] One-line note added to ENGINE.md triage section
- [ ] No other ENGINE.md content changed

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] stripFences(s: string): string helper exists in src/engine/triage.ts or src/engine/log-fmt.ts` | Task 1 | Placed in `log-fmt.ts` |
| `[ ] Applied unconditionally before JSON.parse in validateTriageOutput (line 394)` | Task 1 | Applied as `JSON.parse(stripFences(rawStdout))` |
| `[ ] Strips leading \`\`\`json or bare \`\`\` block opener and trailing \`\`\` closer` | Task 1 | Regex `^```(?:json)?\r?\n...\r?\n```$` |
| `[ ] Passes through input with no fences unchanged (exact identity)` | Task 2 | Tested directly in `log-fmt.test.ts` |
| `[ ] Unit tests cover: no-fence passthrough, \`\`\`json wrapped input, bare \`\`\` wrapped input, whitespace-padded variants` | Task 2 | 5 direct unit tests + 1 round-trip |
| `[ ] Per-file coverage floor for src/engine/triage.ts (95%) maintained` | Task 2 | Verified via `npm run check:coverage` |
| `[ ] All existing tests still pass (npm test)` | Task 2 | Run as final gate |
| `[ ] No compiler/linter warnings introduced (npm run typecheck)` | Task 1 | Verified after import + call-site change |

---

## Testing Strategy

### Unit Tests
- **`tests/engine/log-fmt.test.ts`** (new): 5 tests covering all 4 SPEC cases plus CRLF variant. Test `stripFences` directly — no mocking needed, pure function.
- All tests use Node native test runner (`node:test` + `node:assert`) per project convention.

### Integration / E2E Tests
- One `validateOutput` round-trip test in `triage-validator.test.ts` with fenced JSON input — confirms the strip is wired correctly in the actual parse path.
- Full `npm test` run (578 existing tests) as final regression gate.

## Risk Assessment
- **Coverage regression**: Adding `stripFences` to `log-fmt.ts` adds 2 new lines; new `log-fmt.test.ts` covers them directly. Triage 95% floor unchanged — the call-site change at line 394 is covered by existing `validateOutput` tests plus the new round-trip. Low risk.
- **Exact identity contract**: `stripFences` returns original `s` (not `s.trim()`) when no fence detected — ensures zero behavior change for the 90% of inputs that are already valid JSON. Pinned by the no-fence passthrough test.
- **CRLF edge case**: `\r?\n` in regex handles both line endings; tested explicitly. Risk: near zero.
