Open questions resolved:
1. **Placement**: insert the new section between "Steps" (line 36) and "Write the Research Document" (line 38) — keeps it in the "what to do" zone before the output template.
2. **Conditionality phrasing**: bold conditional block `**If `src/defaults/workflows.yml` is in scope...**` — static Markdown, no runtime branching.
3. **Grep scope**: primary `tests/defaults/` + `tests/dogfood/`; secondary `tests/engine/` with a note that 2-step inline fixtures are not production-shape pins.

```markdown
# Implementation Plan: Cycle 0151

## Overview
Add a conditional "Workflow Shape Mutation" section to `src/defaults/prompts/research.md` that instructs the research agent to enumerate step-count and step-name assertions when `src/defaults/workflows.yml` is in diff scope. Sync to `.cycle/`, add a regression test.

## Current State (from Research)
- `src/defaults/prompts/research.md` is 82 lines; no conditional sections exist.
- `.cycle/prompts/research.md` is byte-identical to the source.
- Prompt content tests live in `tests/defaults/` using `node:test` + `node:assert/strict` + `readFile`. Canonical pattern: `review-prompt-doc-claim-pass.test.ts` (section heading `assert.match`, phrase `assert.ok`, byte-identity via `Buffer.compare`).
- `npm run sync-defaults` copies `src/defaults/` → `.cycle/` with divergence guard.

## Desired End State
- `src/defaults/prompts/research.md` contains a "Workflow Shape Mutation" section (placed between "Steps" and "Write the Research Document") with grep instructions for `steps.length`, step-name array literals, and `deepEqual`/`equal` on named step sequences.
- `.cycle/prompts/research.md` is byte-identical to updated source.
- `tests/defaults/research-prompt-workflow-shape.test.ts` asserts: section heading present, key terms present, byte-identity.
- `npm test`, `npm run typecheck`, coverage gates all pass.

## What We're NOT Doing
- Approach #2 (canonical step-name array export + test rewrite) — deferred.
- Generalizing checklist to non-`workflows.yml` mutations.
- Rewriting historical RESEARCH.md outputs.
- Adding runtime branching to prompt Markdown.

## Implementation Approach
One edit to a Markdown prompt file, one sync command, one new test file. No engine code changes. Follow the `review-prompt-doc-claim-pass.test.ts` test pattern exactly. Place the new section between "Steps" and "Write the Research Document" so it stays in the "what to do before writing output" zone.

---

## Task 1: Add "Workflow Shape Mutation" section to research.md

### Overview
Insert a conditional checklist block into `src/defaults/prompts/research.md` that fires when `src/defaults/workflows.yml` is in scope.

### Changes Required
**File**: `src/defaults/prompts/research.md`

Insert the following block between line 36 (`3. Document everything with **file paths and line numbers**.`) and line 38 (`## Write the Research Document`):

```markdown

## Conditional: Workflow Shape Mutation

**If `src/defaults/workflows.yml` is in scope for this cycle (i.e., the
spec indicates the diff will touch that file), perform the following
additional search before writing the Research Document:**

Search `tests/defaults/` and `tests/dogfood/` (primary) and
`tests/engine/` (secondary) for assertions that pin the workflow step
count or step-name sequence:

1. **Step-count assertions** — grep for `steps.length` and `.length ===`
   in `tests/defaults/` and `tests/dogfood/`. List every matching line.
2. **Step-name array literals** — grep for `deepEqual` and array literals
   containing step names (e.g., `"spec"`, `"research"`, `"plan"`,
   `"build"`, `"documentation"`) in the same directories.
3. **Positional step-index assertions** — grep for `steps[` in
   `tests/defaults/` and `tests/dogfood/`.
4. **`tests/engine/` secondary pass** — grep the same patterns; note that
   inline 2-step fixtures (e.g., `steps.length === 2` on test-only YAML)
   are **not** production-shape pins and should be flagged as such.

List every match as a named task in the "Step-Count/Step-Name Assertions
That Must Be Enumerated" subsection of the Research Document so the
planner carries each one forward.
```

### Success Criteria
- [ ] File contains `## Conditional: Workflow Shape Mutation` heading
- [ ] File contains `src/defaults/workflows.yml` text
- [ ] File contains `steps.length` text
- [ ] File contains `tests/defaults/` text
- [ ] File contains `deepEqual` text
- [ ] Prompt renders cleanly as Markdown (no broken code fences)

---

## Task 2: Sync updated prompt to .cycle/

### Overview
Propagate the source edit to the dogfood copy via the existing sync script.

### Changes Required
Run: `npm run sync-defaults`

This copies `src/defaults/` → `.cycle/` and updates `.cycle/.sync-state.json`. No code changes needed.

### Success Criteria
- [ ] `diff src/defaults/prompts/research.md .cycle/prompts/research.md` exits 0 (files identical)
- [ ] `npm run sync-defaults` exits 0

---

## Task 3: Add regression test

### Overview
New test file asserting the checklist section is present in both the source and deployed prompt.

### Changes Required
**File**: `tests/defaults/research-prompt-workflow-shape.test.ts` (new file)

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const SRC = "src/defaults/prompts/research.md";
const DOG = ".cycle/prompts/research.md";

test("research prompt contains Workflow Shape Mutation section heading", async () => {
  const body = await readFile(SRC, "utf8");
  assert.match(body, /^## Conditional: Workflow Shape Mutation$/m);
});

test("research prompt workflow-shape section references workflows.yml", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("src/defaults/workflows.yml"), "missing workflows.yml reference");
});

test("research prompt workflow-shape section includes step-count grep instruction", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("steps.length"), "missing steps.length grep term");
});

test("research prompt workflow-shape section includes step-name grep instruction", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("deepEqual"), "missing deepEqual grep term");
});

test("research prompt workflow-shape section scopes search to tests/defaults/", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("tests/defaults/"), "missing tests/defaults/ scope");
});

test("dogfood research prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(SRC), readFile(DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/research.md and .cycle/prompts/research.md must match byte-for-byte — run npm run sync-defaults",
  );
});
```

### Success Criteria
- [ ] File exists at `tests/defaults/research-prompt-workflow-shape.test.ts`
- [ ] All 6 tests pass
- [ ] No TypeScript errors in the new file

---

## Task 4: Quality gates

### Overview
Verify the full suite, typecheck, and coverage still pass.

### Changes Required
No code changes. Run:
1. `npm test` — full suite including new test file
2. `npm run typecheck` — no new warnings
3. Coverage auto-runs via `npm run test:coverage` (triggered inside `npm test`)

### Success Criteria
- [ ] `npm test` exits 0, all tests pass
- [ ] `npm run typecheck` exits 0, no warnings
- [ ] Line coverage ≥ 95%, Branch ≥ 75%, Function ≥ 90%
- [ ] Per-file floors all pass (no regressions)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/defaults/prompts/research.md contains a "Workflow Shape Mutation" (or equivalent) section with grep instructions for step-count and step-name assertions.` | Task 1 | Section heading: `## Conditional: Workflow Shape Mutation` |
| `[ ] .cycle/prompts/research.md reflects the same change (sync applied).` | Task 2 | `npm run sync-defaults` |
| `[ ] A test in tests/defaults/ asserts the checklist text is present in the deployed prompt file.` | Task 3 | `research-prompt-workflow-shape.test.ts`; byte-identity test covers `.cycle/` copy |
| `[ ] All existing tests still pass (npm test).` | Task 4 | |
| `[ ] No compiler/linter warnings introduced (npm run typecheck).` | Task 4 | |
| `[ ] Coverage does not decrease vs master baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).` | Task 4 | New test file adds coverage; no source modules changed |

---

## Testing Strategy

### Unit Tests
- 6 assertions in `tests/defaults/research-prompt-workflow-shape.test.ts`:
  - 1 `assert.match` on section heading (regex anchored to line start)
  - 4 `assert.ok(body.includes(...))` on key terms
  - 1 `Buffer.compare` byte-identity against `.cycle/` copy
- No mocking needed — pure `readFile` on static Markdown files.

### Integration / E2E Tests
- `npm run sync-defaults` is the integration boundary; byte-identity test verifies it was run.
- No engine integration tests required — no engine code changes.

## Risk Assessment
- **sync-defaults not run**: byte-identity test in Task 3 catches this at `npm test`.
- **Section placement breaks existing tests**: no existing test asserts the absence of new sections; zero risk.
- **Grep terms in prompt section cause false matches in future codebase greps**: section is inside a Markdown code block if quoted literally — not a concern for code greps.
```
