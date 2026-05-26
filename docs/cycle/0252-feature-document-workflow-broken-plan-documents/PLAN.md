# Implementation Plan: Cycle 0252

## Overview

This cycle delivers the three missing prompt files for the `document` workflow (`plan_documents.md`, `authoring.md`, `review_documents.md`), removes the dead `verify.md` prompt, and syncs all changes to `.cycle/prompts/` so the running engine picks them up.

## Current State (from Research)

- `src/defaults/prompts/` has 16 files; the three document workflow prompts are absent
- `.cycle/prompts/` already has substantive versions of all three prompts but they lack FILE ARTIFACT MODE headers, and `review_documents.md` uses a checkbox verdict format instead of the PASS/NEEDS-FIX title pattern
- `src/defaults/prompts/verify.md` exists but is never loaded by any workflow step as a `prompt:` value
- `tests/defaults/verify-prompt-spec-ac.test.ts` references `verify.md` by path and will fail with ENOENT after deletion — must be deleted
- `scripts/sync-defaults.mjs` scans `src/defaults/` only and does NOT delete orphaned `.cycle/` files; `.cycle/prompts/verify.md` requires manual deletion after the src copy is removed
- Engine reads prompts from `.cycle/`, not `src/defaults/`; `npm run sync-defaults` copies from src to .cycle

## Desired End State

After this cycle:
- `src/defaults/prompts/plan_documents.md`, `authoring.md`, `review_documents.md` exist with FILE ARTIFACT MODE headers and guardrail sections
- `src/defaults/prompts/verify.md` is deleted
- `.cycle/prompts/` mirrors the above: three new files present, `verify.md` gone
- `tests/defaults/verify-prompt-spec-ac.test.ts` deleted; FAM guardrail + byte-identity tests for the three new prompts added to `tests/defaults/file-artifact-mode-guardrail.test.ts`
- `npm test` exits 0 with no regressions

**Verification**:
```
ls src/defaults/prompts/plan_documents.md src/defaults/prompts/authoring.md src/defaults/prompts/review_documents.md
# all three present

ls src/defaults/prompts/verify.md   # ENOENT
ls .cycle/prompts/verify.md          # ENOENT
npm test                              # exits 0
```

## What We're NOT Doing

- Not changing `src/defaults/workflows.yml` — document workflow step definitions are correct
- Not changing any engine code in `src/engine/`
- Not adding per-file coverage floors for the new prompts (prompts are markdown, not instrumented by coverage)
- Not updating `.cycle/.sync-state.json` for the orphaned verify.md entry — causes no runtime failure
- Not changing any other prompts or workflow definitions

## Implementation Approach

The `.cycle/prompts/` files already contain well-structured content for the document workflow. The strategy is:

1. Use the existing `.cycle/` content as the base for each new `src/defaults/prompts/` file
2. Prepend the FILE ARTIFACT MODE inline directive as line 1 (exact sentence from `plan.md:1`)
3. Append the `## File Artifact Mode` guardrail section (WRONG/CORRECT examples) matching the pattern in `build.md:68-91`
4. For `review_documents.md`: update the output template's verdict title to `# Review: Cycle <cycle_id> — PASS` / `NEEDS-FIX` per the SPEC requirement and `review.md` precedent
5. Delete `src/defaults/prompts/verify.md`, delete `tests/defaults/verify-prompt-spec-ac.test.ts`, manually delete `.cycle/prompts/verify.md`
6. Run `npm run sync-defaults` to propagate the three new src files to `.cycle/prompts/`
7. Add FAM guardrail and byte-identity tests for the three new prompts

---

## Task 1: Create `src/defaults/prompts/plan_documents.md`

### Overview

Create the planning prompt for the document workflow. Instructs the agent to read the source issue and produce `PLAN_DOCUMENTS.md` describing which docs to write or edit.

### Changes Required

**File**: `src/defaults/prompts/plan_documents.md` (create new)

**Content structure**:

Line 1 (FILE ARTIFACT MODE directive — must be exact):
```
FILE ARTIFACT MODE: Output only the document contents requested. No narration, no progress commentary, no statements about what you wrote or why. The response IS the file.
```

Lines 2–91: exact body of `.cycle/prompts/plan_documents.md` lines 1–90 (the existing "# Plan Document Changes" content through "Output the plan to stdout. Nothing else. No preamble, no closing remarks.")

Lines 92+: append the `## File Artifact Mode` guardrail section, following the exact pattern from `src/defaults/prompts/build.md:68-91`:

```markdown
## File Artifact Mode

**You are writing a file, not responding in a conversation.** The engine
captures your stdout verbatim and writes it to `PLAN_DOCUMENTS.md`. Every byte you
emit becomes the file.

**Do not include any of the following:**
- insight blocks or star-marker commentary (styled callout blocks with
  decorative headers, regardless of the marker character used)
- confirmation sentences ("Plan written to…", "I have written the plan",
  "Here is the plan")
- trailing commentary addressed to the reader ("Let me know if you want
  me to adjust…", "This plan covers…")

**WRONG** (contaminated output — do not produce this):
> Plan written to `docs/cycle/0252-document-slug/PLAN_DOCUMENTS.md`.
>
> This covers all the changes needed...

**CORRECT** (clean artifact output — produce only this):
> # PLAN_DOCUMENTS — Cycle 0252: [Descriptive Name]

If any of these appear in your output, downstream agents that read
`PLAN_DOCUMENTS.md` as their source of truth will receive contaminated input.
The plan must be clean structured Markdown — nothing else.
```

### Success Criteria

- [ ] `src/defaults/prompts/plan_documents.md` exists
- [ ] Line 1 is the exact FILE ARTIFACT MODE sentence (matches `plan.md:1` verbatim)
- [ ] File contains `## File Artifact Mode` section with WRONG/CORRECT examples
- [ ] File contains the documentation-only scope constraint listing `.md`/`.mdx` and prompt template files

---

## Task 2: Create `src/defaults/prompts/authoring.md`

### Overview

Create the authoring prompt. Instructs the agent to mechanically execute the plan from `PLAN_DOCUMENTS.md`, restricted to markdown files only — no `src/`, no test files, no config, no build tools.

### Changes Required

**File**: `src/defaults/prompts/authoring.md` (create new)

**Content structure**:

Line 1: FILE ARTIFACT MODE directive (same exact sentence)

Lines 2–70: exact body of `.cycle/prompts/authoring.md` lines 1–69 (the "# Execute Document Changes" content through "Output to stdout. Nothing else.")

Lines 71+: append the `## File Artifact Mode` guardrail section:

```markdown
## File Artifact Mode

**You are writing a file, not responding in a conversation.** The engine
captures your stdout verbatim and writes it to `AUTHORING.md`. Every byte you
emit becomes the file.

**Do not include any of the following:**
- insight blocks or star-marker commentary (styled callout blocks with
  decorative headers, regardless of the marker character used)
- confirmation sentences ("AUTHORING.md written to…", "I have completed authoring",
  "Here is the summary")
- trailing commentary addressed to the reader

**WRONG** (contaminated output — do not produce this):
> AUTHORING.md written to `docs/cycle/0252-document-slug/AUTHORING.md`.
>
> Here is the authoring summary...

**CORRECT** (clean artifact output — produce only this):
> # AUTHORING — Cycle 0252

The authoring summary must be clean structured Markdown — nothing else.
```

### Success Criteria

- [ ] `src/defaults/prompts/authoring.md` exists
- [ ] Line 1 is the FILE ARTIFACT MODE directive
- [ ] File contains `## File Artifact Mode` guardrail section with WRONG/CORRECT examples
- [ ] File explicitly prohibits code changes, test changes, and git operations (carried from existing content)

---

## Task 3: Create `src/defaults/prompts/review_documents.md`

### Overview

Create the review prompt. Evaluates documentation quality and emits a pass/revise verdict using the `# Review: Cycle <cycle_id> — PASS` / `NEEDS-FIX` title pattern that the engine can parse — matching the verdict convention established by `review.md`.

### Changes Required

**File**: `src/defaults/prompts/review_documents.md` (create new)

**Content structure**:

Line 1: FILE ARTIFACT MODE directive (same exact sentence)

Lines 2+: content from `.cycle/prompts/review_documents.md` lines 1–85, **with one structural change** to the output template — the verdict section.

**Verdict pattern change** (critical — this is what the SPEC requires):

The existing `.cycle/` version's output template begins with:
```markdown
# REVIEW_DOCUMENTS — Cycle <cycle_id>

## Verdict
- [x] Plan executed faithfully
```

Replace this with the `review.md` PASS/NEEDS-FIX title pattern:
```markdown
# Review: Cycle <cycle_id> — PASS
```
or
```markdown
# Review: Cycle <cycle_id> — NEEDS-FIX
```

The `## Verdict` checklist block is retained as the first section inside the document body (after the title line). The updated output template in the prompt should read:

```markdown
# Review: Cycle <cycle_id> — PASS

## Verdict
- [x] Plan executed faithfully
- [x] Prose reads clearly
- [x] No broken cross-references
- [x] Prompt structure intact (if applicable)
- [x] No stale references elsewhere
- [x] Markdown renders correctly

## MUST-FIX
None. (Or: list blocking issues, one per line, each with file + section
+ exact problem.)

## Notes
- Observations the author should know but that aren't blockers.

## Re-Triage Recommendation (if applicable)
...
```

Lines after existing content: append the `## File Artifact Mode` guardrail section:

```markdown
## File Artifact Mode

**You are writing a file, not responding in a conversation.** The engine
captures your stdout verbatim and writes it to `REVIEW_DOCUMENTS.md`. Every byte you
emit becomes the file.

**Do not include any of the following:**
- insight blocks or star-marker commentary (styled callout blocks with
  decorative headers, regardless of the marker character used)
- confirmation sentences ("Review written to…", "I have completed the review",
  "Here is the review")
- trailing commentary addressed to the reader

**WRONG** (contaminated output — do not produce this):
> REVIEW_DOCUMENTS.md written to `docs/cycle/0252-document-slug/REVIEW_DOCUMENTS.md`.
>
> Here is the review...

**CORRECT** (clean artifact output — produce only this):
> # Review: Cycle 0252 — PASS

The review must be clean structured Markdown — nothing else.
```

### Success Criteria

- [ ] `src/defaults/prompts/review_documents.md` exists
- [ ] Line 1 is the FILE ARTIFACT MODE directive
- [ ] Output template uses `# Review: Cycle <cycle_id> — PASS` / `— NEEDS-FIX` as the document title
- [ ] `## File Artifact Mode` guardrail section with WRONG/CORRECT examples present
- [ ] `**WRONG**` example shows the old contaminated pattern; `**CORRECT**` shows `# Review: Cycle 0252 — PASS`

---

## Task 4: Remove `verify.md` and Delete Broken Test Fixture

### Overview

Delete `src/defaults/prompts/verify.md`, delete the now-broken `tests/defaults/verify-prompt-spec-ac.test.ts`, and manually delete `.cycle/prompts/verify.md`.

### Changes Required

**Pre-deletion check**:
```bash
grep -n "verify.md" src/defaults/workflows.yml
```
Expected: output shows only `command: scripts/verify.sh` (bash step). If any line shows `prompt: prompts/verify.md`, stop — the assumption is wrong and the issue must be re-examined. No such line should exist.

**Delete**: `src/defaults/prompts/verify.md`

**Delete**: `tests/defaults/verify-prompt-spec-ac.test.ts`

Both tests in this file reference `src/defaults/prompts/verify.md` by literal path. With the file gone, both will throw ENOENT. Since `verify.md` is being permanently removed, there is nothing for these tests to assert — delete the entire test file.

**Delete manually**: `.cycle/prompts/verify.md`

`npm run sync-defaults` will NOT remove this file (it only copies from src to .cycle, never deletes). Manual removal required. The `.cycle/.sync-state.json` entry for `.cycle/prompts/verify.md` will become an orphaned record but causes no runtime failure — do not edit `.sync-state.json`.

### Success Criteria

- [ ] `src/defaults/prompts/verify.md` does not exist (`ls` returns ENOENT)
- [ ] `tests/defaults/verify-prompt-spec-ac.test.ts` does not exist
- [ ] `.cycle/prompts/verify.md` does not exist (`ls` returns ENOENT)
- [ ] `grep -n "prompt:" src/defaults/workflows.yml | grep verify` returns no output

---

## Task 5: Run `npm run sync-defaults` to Propagate New Prompts

### Overview

Sync the three new `src/defaults/prompts/` files to `.cycle/prompts/`. After this step the `.cycle/` copies are byte-identical to their `src/defaults/` sources, satisfying the byte-identity invariant that the tests in Task 6 will enforce.

### Changes Required

**Precondition**: Tasks 1–4 must be complete. Specifically, `.cycle/prompts/verify.md` must already be deleted before sync runs (sync won't create it again since `src/defaults/prompts/verify.md` is gone).

**Run**:
```bash
npm run sync-defaults
```

Expected: exits 0. The `.cycle/.sync-state.json` gains entries for `plan_documents.md`, `authoring.md`, `review_documents.md`.

**Verify**:
```bash
ls .cycle/prompts/plan_documents.md .cycle/prompts/authoring.md .cycle/prompts/review_documents.md
# all three should exist

ls .cycle/prompts/verify.md
# ENOENT — already deleted in Task 4; sync did not recreate it
```

### Success Criteria

- [ ] `.cycle/prompts/plan_documents.md` exists
- [ ] `.cycle/prompts/authoring.md` exists
- [ ] `.cycle/prompts/review_documents.md` exists
- [ ] `.cycle/prompts/verify.md` does not exist
- [ ] `npm run sync-defaults` exits 0

---

## Task 6: Add Test Coverage for the Three New Prompts

### Overview

Add FAM guardrail assertions and byte-identity tests for `plan_documents.md`, `authoring.md`, and `review_documents.md` to the existing `tests/defaults/file-artifact-mode-guardrail.test.ts`. This brings the new prompts under the same coverage that `build.md`, `research.md`, `fix.md`, `documentation.md`, and `final_fix.md` already have.

### Changes Required

**File**: `tests/defaults/file-artifact-mode-guardrail.test.ts`

For each of the three new prompts, add a `describe` block (or individual `test` calls matching the existing pattern) with the following assertions:

```typescript
// For each of: "plan_documents", "authoring", "review_documents"
const SRC = `src/defaults/prompts/${name}.md`;
const DOG = `.cycle/prompts/${name}.md`;

test(`${name}: has FILE ARTIFACT MODE inline directive`, async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.startsWith("FILE ARTIFACT MODE: Output only the document contents requested."),
    "missing FILE ARTIFACT MODE inline directive on line 1"
  );
});

test(`${name}: prohibits insight blocks and star-marker commentary`, async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("insight blocks or star-marker commentary"), "missing prohibition");
});

test(`${name}: prohibits confirmation sentences`, async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("confirmation sentences"), "missing prohibition");
});

test(`${name}: prohibits trailing commentary`, async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("trailing commentary"), "missing prohibition");
});

test(`${name}: contains WRONG negative example`, async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG negative example");
});

test(`${name}: dogfood copy is byte-identical to default`, async () => {
  const [src, dog] = await Promise.all([readFile(SRC), readFile(DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    `src/defaults/prompts/${name}.md and .cycle/prompts/${name}.md must match byte-for-byte — run npm run sync-defaults`
  );
});
```

This adds 6 assertions × 3 prompts = 18 new test cases.

### Success Criteria

- [ ] Tests added for all three new prompts in `tests/defaults/file-artifact-mode-guardrail.test.ts`
- [ ] Each prompt has 5 FAM content assertions and 1 byte-identity assertion
- [ ] `npm test` exits 0 with no failures
- [ ] Coverage does not regress vs baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`src/defaults/prompts/plan_documents.md\` exists and contains a \`FILE ARTIFACT MODE\` header` | Task 1 | |
| `[ ] \`src/defaults/prompts/authoring.md\` exists and contains a \`FILE ARTIFACT MODE\` header` | Task 2 | |
| `[ ] \`src/defaults/prompts/review_documents.md\` exists and contains a \`FILE ARTIFACT MODE\` header` | Task 3 | |
| `[ ] \`src/defaults/prompts/verify.md\` does not exist` | Task 4 | |
| `[ ] \`.cycle/prompts/plan_documents.md\` exists (sync-defaults ran successfully)` | Task 5 | |
| `[ ] \`.cycle/prompts/authoring.md\` exists (sync-defaults ran successfully)` | Task 5 | |
| `[ ] \`.cycle/prompts/review_documents.md\` exists (sync-defaults ran successfully)` | Task 5 | |
| `[ ] \`.cycle/prompts/verify.md\` does not exist (sync-defaults propagated the deletion)` | Task 4 | Manual deletion required; sync-defaults does not delete orphaned `.cycle/` files |
| `[ ] \`npm test\` passes with no new failures` | Task 6 | Full suite gate; byte-identity tests enforce sync was run |
| `[ ] No entry in \`src/defaults/workflows.yml\` references \`prompts/verify.md\` as a non-bash step prompt` | Task 4 | Pre-deletion grep check before removing the file |

---

## Testing Strategy

### Unit Tests

- FAM directive assertion: `body.startsWith("FILE ARTIFACT MODE: Output only the document contents requested.")` — ensures line 1 is correct
- Guardrail content assertions: `body.includes(...)` for prohibition phrases and `**WRONG**` example
- Byte-identity: `Buffer.compare(srcBuf, dogBuf) === 0` — fails immediately if sync-defaults was not run or ran against stale src files
- No mocking required — all tests use real filesystem reads via `readFile`

### Integration / E2E Tests

- `npm test` full suite: catches any regression from the `verify-prompt-spec-ac.test.ts` deletion (those tests must be gone before the suite runs)
- Manual smoke: `head -1 src/defaults/prompts/plan_documents.md src/defaults/prompts/authoring.md src/defaults/prompts/review_documents.md` — all three lines must be the FILE ARTIFACT MODE directive

## Risk Assessment

- **ENOENT from `verify-prompt-spec-ac.test.ts` if test file not deleted before `npm test`**: Task 4 deletes the test file as an explicit step; success criteria require its absence before proceeding to Task 6.
- **`sync-defaults` not deleting `.cycle/prompts/verify.md`**: Task 4 explicitly includes manual deletion of `.cycle/prompts/verify.md` with ENOENT verification. Task 5's success criteria confirm `verify.md` remains absent after sync.
- **Byte-identity tests failing if sync not run**: Task 5 (sync-defaults) must complete before Task 6's byte-identity assertions pass. If sync was not run, all three byte-identity tests will fail — surfacing the gap immediately rather than silently.
- **`review_documents.md` verdict format diverging from engine expectation**: SPEC explicitly requires the `review.md` PASS/NEEDS-FIX title pattern. The document workflow is currently broken (no src file), so there is no existing runtime behavior to break. The updated verdict format in Task 3 aligns with the only documented engine verdict signal.
- **`.cycle/` prompts already present with different content**: After `npm run sync-defaults` in Task 5, the `.cycle/` copies are overwritten with the new canonical `src/defaults/` content. The existing `.cycle/` content (lacking FAM headers) is replaced. This is the intended outcome and is byte-identity-verified by Task 6 tests.
