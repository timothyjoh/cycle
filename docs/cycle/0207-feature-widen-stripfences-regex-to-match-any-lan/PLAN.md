All details verified. Writing the plan now.

```markdown
# Implementation Plan: Cycle 0207

## Overview
Widen the `stripFences` opening-fence regex from `(?:json)?` to `(?:\w+)?` so any LLM-emitted language tag (javascript, text, JSON, jsonc, etc.) is stripped before `JSON.parse`. Four new unit tests cover the new variants; ENGINE.md "Known limitation" note is replaced.

## Current State (from Research)
- `src/engine/log-fmt.ts:6` — regex: `/^```(?:json)?\r?\n([\s\S]*?)\r?\n```$/`
- `tests/engine/log-fmt.test.ts` — 5 existing tests; all pass; pattern: build `inner`, concat fence delimiters, `assert.equal(stripFences(...), inner)`
- `scripts/coverage-gate.mjs:26` — `"src/engine/log-fmt.ts": 100` floor; must stay at 100%
- `docs/ENGINE.md:17-19` — "Fence handling" paragraph + "Known limitation" sentence name the exact bug and expected fix
- No `i` flag needed: `\w` matches `[A-Za-z0-9_]` — inherently handles `JSON` vs `json` vs `Json`

## Desired End State
- `stripFences` regex: `/^```(?:\w+)?\r?\n([\s\S]*?)\r?\n```$/`
- 9 passing tests in `tests/engine/log-fmt.test.ts` (5 old + 4 new)
- ENGINE.md "Known limitation" block replaced with updated capability description
- All coverage gates pass; `src/engine/log-fmt.ts` at 100%
- `npm test` and `npm run test:coverage` pass with zero failures

## What We're NOT Doing
- Not adding an `i` flag (not needed; `\w` is already case-inclusive)
- Not changing the closing fence pattern `/\r?\n```$/` (correct as-is)
- Not touching `parseWithRepair` reflection fence recovery (separate issue)
- Not adding integration/E2E tests (pure function; unit tests sufficient)
- Not touching any caller (`src/engine/triage.ts`)

## Implementation Approach
Single regex change in one file, four new test cases in one test file, one paragraph update in one doc file. All changes are independent of each other and can be made in any order, but sequencing implementation → tests → docs is cleanest for verification.

---

## Task 1: Widen stripFences Regex

### Overview
Replace the narrow `(?:json)?` non-capturing group with `(?:\w+)?` so any word-character language tag is matched.

### Changes Required
**File**: `src/engine/log-fmt.ts`

**Line 6** — change:
```ts
const m = s.trim().match(/^```(?:json)?\r?\n([\s\S]*?)\r?\n```$/);
```
to:
```ts
const m = s.trim().match(/^```(?:\w+)?\r?\n([\s\S]*?)\r?\n```$/);
```

That is the complete diff. No other lines in this file change.

### Success Criteria
- [ ] `src/engine/log-fmt.ts` compiles cleanly (`npm run typecheck`)
- [ ] All 5 existing `log-fmt` tests still pass
- [ ] `stripFences("```javascript\n...\n```")` returns inner string (verified by Task 2 tests)

---

## Task 2: Add Four New Unit Test Cases

### Overview
Add one `test()` block per new variant to `tests/engine/log-fmt.test.ts`, following the identical pattern of the 5 existing tests.

### Changes Required
**File**: `tests/engine/log-fmt.test.ts`

Append after line 28:

```ts
test("stripFences: strips ```javascript opener and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```javascript\n" + inner + "\n```"), inner);
});

test("stripFences: strips ```text opener and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```text\n" + inner + "\n```"), inner);
});

test("stripFences: strips ```JSON opener (uppercase) and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```JSON\n" + inner + "\n```"), inner);
});

test("stripFences: strips ```jsonc opener and ``` closer", () => {
  const inner = '{"ordering":[],"new_issues":[]}';
  assert.equal(stripFences("```jsonc\n" + inner + "\n```"), inner);
});
```

### Success Criteria
- [ ] `npm test` reports 9 passing tests in `log-fmt.test.ts`, 0 failures
- [ ] `npm run test:coverage` shows `src/engine/log-fmt.ts` at 100% line coverage
- [ ] `npm run check:coverage` passes

---

## Task 3: Update ENGINE.md Documentation

### Overview
Replace the "Known limitation" paragraph (lines 19) with updated text that describes the now-widened capability.

### Changes Required
**File**: `docs/ENGINE.md`

**Replace** the existing "Fence handling" block (lines 17-19):
```
**Fence handling:** The triage prompt instructs the agent not to wrap output in markdown code fences (cycle 0205). As a deterministic code-side fallback, `stripFences(rawStdout)` is applied unconditionally before `JSON.parse` in `validateOutput` (cycle 0206) — strips leading ` ```json ` or bare ` ``` ` opener and trailing ` ``` ` closer, passes through unfenced input unchanged.

**Known limitation:** `stripFences` matches ` ```json ` or bare ` ``` ` openers via `/^```(?:json)?\r?\n/`. Other language tags emitted by LLMs (` ```javascript `, ` ```text `, ` ```JSON ` — case-sensitive mismatch, ` ```jsonc `) pass through unstripped and still cause `JSON.parse` to fail despite the fallback. Fix: widen the opener pattern to any optional word tag (`/^```(?:\w+)?\r?\n/`) with case-insensitive matching.
```

**With**:
```
**Fence handling:** The triage prompt instructs the agent not to wrap output in markdown code fences (cycle 0205). As a deterministic code-side fallback, `stripFences(rawStdout)` is applied unconditionally before `JSON.parse` in `validateOutput` (cycle 0206) — strips leading ` ```json `, bare ` ``` `, or any language-tagged opener (` ```javascript `, ` ```text `, ` ```JSON `, ` ```jsonc `, etc.) and trailing ` ``` ` closer, passes through unfenced input unchanged. The opening pattern `/^```(?:\w+)?\r?\n/` matches any optional `\w+` language tag, covering all LLM-emitted variants (cycle 0207).
```

### Success Criteria
- [ ] "Known limitation" paragraph removed from ENGINE.md
- [ ] Updated fence-handling description accurately describes the widened regex
- [ ] No other ENGINE.md content modified

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] stripFences("```javascript\n{...}\n```")` returns `{...}` | Task 1 + Task 2 | Regex change + test case |
| `[ ] stripFences("```text\n{...}\n```")` returns `{...}` | Task 1 + Task 2 | Regex change + test case |
| `[ ] stripFences("```JSON\n{...}\n```")` returns `{...}` (case-insensitive) | Task 1 + Task 2 | `\w` covers uppercase; test case added |
| `[ ] stripFences("```jsonc\n{...}\n```")` returns `{...}` | Task 1 + Task 2 | Regex change + test case |
| `[ ] Existing tests for \`\`\`json and bare \`\`\` pass unchanged` | Task 1 | Regex is backward-compatible; `(?:\w+)?` still matches `json` and empty |
| `[ ] New unit test cases added for each variant above` | Task 2 | 4 new `test()` blocks |
| `[ ] npm test passes with zero failures` | Task 1 + Task 2 | Verified after both tasks |
| `[ ] npm run test:coverage + npm run check:coverage pass; src/engine/log-fmt.ts remains at 100%` | Task 1 + Task 2 | All new lines covered by new tests |
| `[ ] All existing tests still pass` | Task 1 | Backward-compatible change |
| `[ ] No compiler/linter warnings introduced` | Task 1 | Pure regex string change; no type impact |

---

## Testing Strategy

### Unit Tests
- `tests/engine/log-fmt.test.ts` — append 4 new `test()` blocks (one per acceptance variant)
- Same `inner` string pattern as existing tests; `assert.equal` strict equality
- No mocking needed — `stripFences` is a pure function with no I/O

### Integration / E2E Tests
- None required; the function is pure and fully exercised by unit tests
- `npm run test:coverage` + `npm run check:coverage` serve as the gate

## Risk Assessment
- **Regex over-match**: `(?:\w+)?` is maximally broad — could it strip a fence that isn't actually wrapping JSON? No: the closing `\r?\n```$` anchor requires a matching closer; non-fence content that happens to start with a backtick-word would need an exact closer at the end too, which is vanishingly unlikely and is current behavior for `json`-tagged fences anyway.
- **Coverage drop**: All 4 new code paths (new tag variants) are immediately exercised by the 4 new tests. Risk: none.
- **Backward compat**: `(?:\w+)?` still matches the empty string (bare ` ``` `) and `json` — all 5 existing tests remain green.
```
