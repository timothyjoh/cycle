Change sites confirmed. Writing plan to stdout.

```markdown
# Implementation Plan: Cycle 0159

## Overview
Tighten two existing `expectedFrontmatter` string assertions from `"---\n"` to `"---\n\n"` so the mandatory blank line between the frontmatter closing fence and the issue body is explicitly pinned. No production code changes.

## Current State (from Research)
- `src/issue/materialize.ts:23` already emits `["---", "", text, ""].join("\n")` — the blank line is present in production output.
- `tests/issue/materialize.test.ts:29` — `expectedFrontmatter` terminates at `"---\n"`, missing the blank-line separator.
- `tests/cli/multi-loop.test.ts:197` — same gap in integration test's `expectedFrontmatter`.
- Both tests use `assert.ok(body.startsWith(expectedFrontmatter))` — a writer bug dropping the blank line would pass silently.

## Desired End State
Both `expectedFrontmatter` strings end with `"---\n\n"`. A mutation that removes the blank line from `materialize.ts` causes at least one test to fail. Full suite (504 tests) passes with no coverage regression.

## What We're NOT Doing
- No changes to `src/` (any file).
- No new test cases.
- No changes to `CLAUDE.md`, `AGENTS.md`, or `README.md`.
- Not addressing the dry-run log-file asymmetry (separate issue).

## Implementation Approach
Two single-character additions (`\n` appended to each terminal `"---\n"`), followed by a transient mutation check against `materialize.ts` to prove the new assertions are load-bearing, then revert.

---

## Task 1: Pin blank-line separator in materialize unit test

### Overview
Change `expectedFrontmatter` in `tests/issue/materialize.test.ts` so it terminates with `"---\n\n"`, explicitly asserting the blank line between frontmatter fence and body.

### Changes Required
**File**: `tests/issue/materialize.test.ts`
**Line 29**: `"---\n"` → `"---\n\n"`

Before:
```ts
      "priority: 3\n" +
      "---\n";
```
After:
```ts
      "priority: 3\n" +
      "---\n\n";
```

### Success Criteria
- [ ] Line 29 reads `"---\n\n"`.
- [ ] `npm test` passes (all 504 tests green).

---

## Task 2: Pin blank-line separator in multi-loop integration test

### Overview
Change `expectedFrontmatter` in `tests/cli/multi-loop.test.ts` so it terminates with `"---\n\n"`, extending the same pin to the integration-level test.

### Changes Required
**File**: `tests/cli/multi-loop.test.ts`
**Line 197**: `"---\n"` → `"---\n\n"`

Before:
```ts
      "priority: 3\n" +
      "---\n";
```
After:
```ts
      "priority: 3\n" +
      "---\n\n";
```

### Success Criteria
- [ ] Line 197 reads `"---\n\n"`.
- [ ] `npm test` passes (all 504 tests green).

---

## Task 3: Mutation verification (transient — do not commit)

### Overview
Prove the new assertions are load-bearing by temporarily breaking `materialize.ts` and confirming failure.

### Steps
1. Edit `src/issue/materialize.ts:23`: change `["---", "", text, ""].join("\n")` to `["---", text, ""].join("\n")` (remove the `""` blank-line element).
2. Run `npm test`.
3. Confirm at least one test fails (expect the materialize unit test and/or multi-loop integration test to fail with a `frontmatter mismatch` message).
4. **Revert** `src/issue/materialize.ts` to original before any commit.

### Success Criteria
- [ ] At least one test fails with the mutation applied.
- [ ] `src/issue/materialize.ts` restored to original before commit.

---

## Task 4: Full verification pass

### Overview
Run all quality gates to confirm no regression.

### Steps
1. `npm run typecheck` — zero warnings.
2. `npm run test:coverage` — coverage floors not regressed.
3. `npm test` — 504/504 pass.

### Success Criteria
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run test:coverage` + `npm run check:coverage` pass all per-file floors.
- [ ] Global coverage: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%.
- [ ] 504 tests green, 0 failed.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] tests/issue/materialize.test.ts` `expectedFrontmatter` string ends with `"---\n\n"`. | Task 1 | |
| `[ ] tests/cli/multi-loop.test.ts` `expectedFrontmatter` string ends with `"---\n\n"`. | Task 2 | |
| `[ ] Mutation check: temporarily change materialize.ts line 23 from ["---", "", text, ""].join("\n") to ["---", text, ""].join("\n") and confirm at least one test fails; revert the mutation before committing.` | Task 3 | Transient — not committed |
| `[ ] All existing tests still pass (npm test).` | Task 4 | |
| `[ ] No compiler/linter warnings introduced (npm run typecheck).` | Task 4 | |
| `[ ] Coverage floors not regressed (npm run test:coverage).` | Task 4 | |

---

## Testing Strategy

### Unit Tests
- `tests/issue/materialize.test.ts` — "writes a markdown file with frontmatter to raw/" — assertion tightened; `startsWith` now consumes through the blank line.

### Integration / E2E Tests
- `tests/cli/multi-loop.test.ts` — "'run \"<text>\" --dry-run' pins raw frontmatter byte-shape (priority: 3 default)" — same tightening at integration level provides defense-in-depth.

## Risk Assessment
- **False mutation result**: If `startsWith` still passes after removing the blank line (e.g., body begins with `---\n` via some other path) — unlikely given `materialize.ts` is the sole writer. Mitigation: inspect the actual failure message to confirm it's a `frontmatter mismatch`.
- **504 → count drift**: If cycle 0158 landing changed test count. Mitigation: accept whatever current passing count is; what matters is 0 failures.
```
