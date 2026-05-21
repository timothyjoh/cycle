# Implementation Plan: Cycle 0214

## Overview
Add a `## File Artifact Mode` guardrail section to `src/defaults/prompts/review.md` to prevent the review agent from contaminating REVIEW.md artifacts with learning-mode narration, insight blocks, and markdown fence wrappers. Mirrors the pattern established in cycles 0212 (spec.md) and 0213 (plan.md).

## Current State (from Research)
- `review.md` is 232 lines with no `## File Artifact Mode` section
- Insertion point: between line 107 (`Unbacked claims are a NEEDS-FIX trigger.`) and line 109 (`## Output 1: REVIEW.md`)
- Section wording mirrors `plan.md` variant — third prohibition is "trailing commentary" (not spec.md's "informal single-sentence substitutes")
- Key prohibition strings: `"You are writing a file, not responding in a conversation"`, `"insight blocks or star-marker"`, `"confirmation sentences"`
- Test file: `tests/defaults/review-prompt-spec-ac.test.ts` (4 existing tests; already reads `SRC = "src/defaults/prompts/review.md"`)
- Dogfood byte-identity test at `tests/defaults/plan-prompt-spec-traceability.test.ts:89–96` enforces sync-defaults compliance

## Desired End State
- `src/defaults/prompts/review.md` contains `## File Artifact Mode` before `## Output 1: REVIEW.md`
- `.cycle/prompts/review.md` byte-identical to `src/defaults/prompts/review.md`
- `tests/defaults/review-prompt-spec-ac.test.ts` has 3 new assertions (7 total)
- All tests pass; coverage gates hold

Verify: `grep -c "^## File Artifact Mode$" src/defaults/prompts/review.md` returns `1`; `npm test` green.

## What We're NOT Doing
- No engine-level post-write stripping of REVIEW.md (prompt guardrail is the preferred fix direction per the issue)
- No changes to Pass 1/2/3 review logic or MUST-FIX task shapes
- No changes to spec.md or plan.md (already have guardrails)
- No PLAN.md artifact cleanliness check for the Pass 1 checklist (that is `refl-0213`, a separate issue)
- No coverage infrastructure changes

## Implementation Approach
Identical pattern to cycles 0212 and 0213: insert `## File Artifact Mode` into the prompt template just before the Output section, run `npm run sync-defaults`, then add three string-inclusion test assertions. The section content is adapted from `plan.md`'s variant with `REVIEW.md`-specific wording.

---

## Task 1: Add File Artifact Mode section to review.md prompt

### Overview
Insert the `## File Artifact Mode` section into `src/defaults/prompts/review.md` between `Unbacked claims are a NEEDS-FIX trigger.` (line 107) and `## Output 1: REVIEW.md` (line 109).

### Changes Required
**File**: `src/defaults/prompts/review.md`

Insert this block after line 107 (`Unbacked claims are a NEEDS-FIX trigger.`), adding a blank line before `## Output 1: REVIEW.md`:

```markdown
## File Artifact Mode

**You are writing a file, not responding in a conversation.** The engine
captures your stdout verbatim and writes it to `REVIEW.md`. Every byte you
emit becomes the file.

**Do not include any of the following:**
- insight blocks or star-marker commentary (styled callout blocks with
  decorative headers, regardless of the marker character used)
- confirmation sentences ("Review written to…", "I have completed the review",
  "Here is the review")
- trailing commentary addressed to the reader ("Let me know if you want
  me to adjust…", "This review covers…")

If any of these appear in your output, downstream agents that read
`REVIEW.md` as their source of truth will receive contaminated input and
produce incorrect fix plans. The review must be clean structured
Markdown — nothing else.
```

### Success Criteria
- [ ] `grep -c "^## File Artifact Mode$" src/defaults/prompts/review.md` returns `1`
- [ ] Section appears between `Unbacked claims are a NEEDS-FIX trigger.` and `## Output 1: REVIEW.md`
- [ ] Three prohibition bullets present: insight blocks, confirmation sentences, trailing commentary

---

## Task 2: Sync defaults

### Overview
Run `npm run sync-defaults` to propagate the updated `src/defaults/prompts/review.md` to `.cycle/prompts/review.md`.

### Changes Required
**Command**: `npm run sync-defaults`

No manual file edits — the sync script handles the copy.

### Success Criteria
- [ ] `.cycle/prompts/review.md` byte-identical to `src/defaults/prompts/review.md`
- [ ] Dogfood test at `tests/defaults/plan-prompt-spec-traceability.test.ts:89–96` passes

---

## Task 3: Add test assertions for File Artifact Mode strings

### Overview
Add 3 new tests to `tests/defaults/review-prompt-spec-ac.test.ts` verifying the key prohibition strings are present in the prompt.

### Changes Required
**File**: `tests/defaults/review-prompt-spec-ac.test.ts`

Append after the 4 existing tests:

```typescript
test("review prompt includes File Artifact Mode guardrail header", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("You are writing a file, not responding in a conversation"),
    "missing File Artifact Mode guardrail sentence",
  );
});

test("review prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("insight blocks or star-marker"),
    "missing insight blocks / star-marker prohibition",
  );
});

test("review prompt File Artifact Mode prohibits confirmation sentences", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("confirmation sentences"),
    "missing confirmation sentences prohibition",
  );
});
```

### Success Criteria
- [ ] 3 new tests added; total in file = 7
- [ ] All 3 new tests pass
- [ ] `npm test` green; no regressions

---

## SPEC Acceptance Traceability

SPEC.md for cycle 0214 is contaminated (single narrative prose sentence; no `## Acceptance Criteria` section). ACs sourced directly from upstream issue `docs/cycle/issues/todo/refl-0211-review-md-artifact-contaminated-with-lea.md`.

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `- [ ] REVIEW.md written by the documentation step contains no leading prose, insight blocks, or markdown fence wrappers` | Task 1 | File Artifact Mode guardrail suppresses contamination at invocation time |
| `- [ ] The review verdict line (\`PASS\`/\`FAIL\`) is present and greppable at the top level of the file (not wrapped in a fence)` | Task 1 | Guardrail explicitly prohibits fence wrappers |
| `- [ ] No trailing narration lines appear after the review content` | Task 1 | Guardrail prohibits trailing commentary |
| `- [ ] Existing REVIEW.md-related tests pass without regression` | Task 3 | No logic changes; `npm test` full suite verifies no regressions |
| `- [ ] Fix approach is consistent with \`refl-0209-spec-md-artifacts-contain-learning-mode\` — no divergent sanitization patterns between spec and review artifact handling` | Task 1 | Mirrors spec.md (cycle 0212) and plan.md (cycle 0213) prompt guardrail pattern exactly |

---

## Testing Strategy

### Unit Tests
- 3 new string-inclusion assertions in `tests/defaults/review-prompt-spec-ac.test.ts`
- Assert exact prohibition strings: `"You are writing a file, not responding in a conversation"`, `"insight blocks or star-marker"`, `"confirmation sentences"`
- No mocking needed — tests read the prompt file directly from disk via `readFile`

### Integration / E2E Tests
- Dogfood byte-identity test at `tests/defaults/plan-prompt-spec-traceability.test.ts:89–96` verifies `src/defaults/prompts/review.md` === `.cycle/prompts/review.md` byte-for-byte; fails if sync-defaults not run
- Full suite (`npm test`, currently 608 tests) must pass with no regressions

## Risk Assessment
- **Insertion point after line 107**: Line numbers in review.md shift after insertion; no code references review.md by line number, so no downstream impact.
- **Wording drift from plan.md**: Use plan.md's exact phrasing for all three bullet prohibitions. The dogfood test catches sync drift; a side-by-side diff of the two `## File Artifact Mode` sections after editing confirms wording consistency.
- **sync-defaults not run**: Caught automatically by the dogfood byte-identity test at `plan-prompt-spec-traceability.test.ts:89`; the build will fail if skipped.
