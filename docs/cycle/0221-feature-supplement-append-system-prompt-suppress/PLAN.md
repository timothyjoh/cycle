I have all the context needed. Writing the plan now.

# Implementation Plan: Cycle 0221

## Overview

Add an inline `FILE ARTIFACT MODE:` directive to all seven artifact prompt templates (`spec`, `plan`, `build`, `review`, `research`, `fix`, `documentation`) so that contamination suppression is present as a user-turn-level instruction, complementing the existing `--append-system-prompt` mechanism.

## Current State (from Research)

All seven templates under `src/defaults/prompts/` already have a `## File Artifact Mode` section with prohibition lists and WRONG/CORRECT examples. None contain the new inline `FILE ARTIFACT MODE:` one-liner directive. `ARTIFACT_STEPS` in `run-cycle.ts:35` covers all seven: `["spec", "research", "plan", "build", "review", "fix", "documentation"]`. Test coverage is split across three files: `file-artifact-mode-guardrail.test.ts` (build/research/fix/documentation), `plan-prompt-spec-traceability.test.ts` (plan/review), `spec-prompt-ac.test.ts` (spec). Dogfood byte-identity tests already enforce that `.cycle/prompts/` matches `src/defaults/prompts/` after `sync-defaults`.

## Desired End State

Each of the seven templates has the `FILE ARTIFACT MODE:` directive as its very first line (before the `# Title` heading), making it the first instruction the model encounters. The directive reads:

```
FILE ARTIFACT MODE: Output only the document contents requested. No narration, no progress commentary, no statements about what you wrote or why. The response IS the file.
```

After `npm run sync-defaults`, `.cycle/prompts/` copies are byte-identical to `src/defaults/prompts/`. Seven new tests (one per template) assert the directive is present. All existing tests continue to pass.

## What We're NOT Doing

- Removing or modifying the `--append-system-prompt` / `ARTIFACT_SUPPRESS_PROMPT` mechanism — keep both active
- Adding WRONG/CORRECT examples to `spec.md` (flagged in obs 3081 but out of scope for 0221)
- Modifying any source files outside `src/defaults/prompts/` and the three test files
- Changing the `ARTIFACT_STEPS` set or `run-cycle.ts`

## Implementation Approach

Prepend the one-line directive to all seven templates as the very first line. Placement at the top of the file maximizes the directive's influence — it is processed before any other instruction. The existing `## File Artifact Mode` section with WRONG/CORRECT examples remains intact and is not moved or modified. New tests follow the exact `assert.ok(body.includes(...))` pattern already used across the three existing test files, distributed by template ownership.

---

## Task 1: Prepend FILE ARTIFACT MODE directive to all seven prompt templates

### Overview

Add the inline directive as the first line of each of the seven artifact prompt templates in `src/defaults/prompts/`. The directive is placed before the existing `# Title` heading, so it is the first content the model encounters.

### Changes Required

Apply the same prefix to each of the seven files:

```
FILE ARTIFACT MODE: Output only the document contents requested. No narration, no progress commentary, no statements about what you wrote or why. The response IS the file.

```

(One blank line separates the directive from the `# Title` heading that follows.)

**File**: `src/defaults/prompts/spec.md`
**Change**: Insert directive + blank line before `# Write Cycle Spec` (currently line 1)

**File**: `src/defaults/prompts/plan.md`
**Change**: Insert directive + blank line before `# Create Implementation Plan for Cycle` (currently line 1)

**File**: `src/defaults/prompts/build.md`
**Change**: Insert directive + blank line before existing `# ...` heading (currently line 1)

**File**: `src/defaults/prompts/review.md`
**Change**: Insert directive + blank line before `# Review Cycle Implementation` (currently line 1)

**File**: `src/defaults/prompts/research.md`
**Change**: Insert directive + blank line before `# Research Codebase for Cycle` (currently line 1)

**File**: `src/defaults/prompts/fix.md`
**Change**: Insert directive + blank line before existing `# ...` heading (currently line 1)

**File**: `src/defaults/prompts/documentation.md`
**Change**: Insert directive + blank line before existing `# ...` heading (currently line 1)

### Success Criteria

- [ ] All seven files begin with `FILE ARTIFACT MODE: Output only the document contents requested.`
- [ ] Existing WRONG/CORRECT sections in all seven files remain intact (verify by grepping for `**WRONG**` — should still appear in all six that had them)
- [ ] `npm run build` succeeds (no TypeScript errors in modified files)

---

## Task 2: Add directive-presence tests to the three existing test files

### Overview

Add one `assert.ok(body.includes(...))` test per template to the existing test files, following the established pattern. Distribute by the same ownership as existing tests: `file-artifact-mode-guardrail.test.ts` for build/research/fix/documentation, `plan-prompt-spec-traceability.test.ts` for plan/review, `spec-prompt-ac.test.ts` for spec.

### Changes Required

**File**: `tests/defaults/spec-prompt-ac.test.ts`

Add one test after the existing File Artifact Mode tests:

```typescript
test("spec prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("FILE ARTIFACT MODE: Output only the document contents requested"),
    "missing inline FILE ARTIFACT MODE directive in spec.md",
  );
});
```

**File**: `tests/defaults/plan-prompt-spec-traceability.test.ts`

Add two tests — one for plan.md, one for review.md:

```typescript
test("plan prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.ok(
    body.includes("FILE ARTIFACT MODE: Output only the document contents requested"),
    "missing inline FILE ARTIFACT MODE directive in plan.md",
  );
});

test("review prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(REVIEW_SRC, "utf8");
  assert.ok(
    body.includes("FILE ARTIFACT MODE: Output only the document contents requested"),
    "missing inline FILE ARTIFACT MODE directive in review.md",
  );
});
```

**File**: `tests/defaults/file-artifact-mode-guardrail.test.ts`

Add four tests — one for each of build.md, research.md, fix.md, documentation.md. Pattern for build (repeat for others, referencing `BUILD_SRC`, `RESEARCH_SRC`, `FIX_SRC`, `DOC_SRC`):

```typescript
test("build prompt contains inline FILE ARTIFACT MODE directive", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(
    body.includes("FILE ARTIFACT MODE: Output only the document contents requested"),
    "missing inline FILE ARTIFACT MODE directive in build.md",
  );
});
```

(Replicate for `RESEARCH_SRC`/research.md, `FIX_SRC`/fix.md, `DOC_SRC`/documentation.md with matching messages.)

Total new tests: 7 (one per template). All use `assert.ok(body.includes(...))` — no cardinality pinning needed since this is a presence check, not an exactly-once event.

### Success Criteria

- [ ] 7 new tests added across the three existing test files
- [ ] Each new test fails before Task 1 is applied (red-first verification)
- [ ] Each new test passes after Task 1 is applied

---

## Task 3: Sync defaults and verify all quality gates

### Overview

Run `npm run sync-defaults` to propagate the updated templates from `src/defaults/prompts/` to `.cycle/prompts/`. Verify the full test suite, typecheck, and coverage gates all pass.

### Changes Required

No code changes — operational steps only:

1. `npm run sync-defaults` — copies `src/defaults/` → `.cycle/`
2. `npm test` — runs full suite including the 7 new directive tests and existing dogfood byte-identity tests
3. `npm run typecheck` — confirms no TypeScript errors
4. `npm run check:coverage` runs automatically after `npm test:coverage`; confirm line ≥ 95%, branch ≥ 75%, function ≥ 90%

### Success Criteria

- [ ] `npm run sync-defaults` exits 0
- [ ] All seven `.cycle/prompts/` files begin with the `FILE ARTIFACT MODE:` directive
- [ ] Dogfood byte-identity tests for all seven templates pass
- [ ] `npm test` passes with 0 failures (expected: 652 + 7 = 659 tests or current baseline + 7)
- [ ] `npm run typecheck` exits 0
- [ ] Coverage gates satisfied (no decrease from baseline: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)

---

## SPEC Acceptance Traceability

The canonical SPEC is the `## Acceptance Criteria` section of the issue file `docs/cycle/issues/todo/refl-0219-append-system-prompt-suppression-still-i.md` (the generated SPEC.md was contaminated and contains only a confirmation sentence, not structured acceptance criteria).

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `FILE ARTIFACT MODE` directive present in all six artifact prompt templates under `src/defaults/` | Task 1 | ARTIFACT_STEPS contains 7 templates; all seven receive the directive |
| After `npm run sync-defaults`, directive is also present in the corresponding `.cycle/prompts/` copies | Task 3 | Existing dogfood byte-identity tests enforce byte-for-byte match |
| Existing WRONG/CORRECT negative examples remain intact and are not disrupted by the new directive placement | Task 1 | Directive prepended before `# Title`; WRONG/CORRECT sections are deep in each file and untouched |
| `npm test` passes, `npm run typecheck` passes, coverage gates satisfied | Task 3 | Verified as final quality gate |
| A prompt-content assertion test verifies the directive is present in each of the six template files | Task 2 | 7 new tests (one per template); distributed across existing test files by template ownership |

---

## Testing Strategy

### Unit Tests

All tests are prompt-content assertion tests (file reads, no network, no subprocess). Pattern: `readFile(path, "utf8")` then `assert.ok(body.includes(marker))`.

- Assertion marker: `"FILE ARTIFACT MODE: Output only the document contents requested"` — specific enough to be unique, short enough to be readable
- No mocking needed — tests read real files from disk
- Dogfood byte-identity tests (`Buffer.compare`) already cover the sync-defaults requirement

### Integration / E2E Tests

None required beyond the existing dogfood byte-identity tests. Template content is static and does not interact with runtime engine logic. The `--append-system-prompt` injection path is unchanged and already covered by `run-cycle.append-system-prompt-warning.test.ts`.

## Risk Assessment

- **Directive placement breaks existing FAM section structure**: Mitigated — directive is prepended before the `# Title` heading; no existing content is moved or modified.
- **sync-defaults copies wrong files**: Mitigated — dogfood byte-identity tests catch any divergence immediately.
- **Coverage decrease**: No new runtime code; only static content and test additions. Coverage will not decrease.
- **Contamination persists despite directive**: This cycle adds belt-and-suspenders; cannot guarantee model compliance, only that the instruction is present at the strongest possible position. Further cycles may address if contamination recurs.
